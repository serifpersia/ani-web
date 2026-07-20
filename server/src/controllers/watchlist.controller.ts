import { Request, Response } from 'express'
import logger from '../logger'
import { DatabaseWrapper } from '../db'
import { AllAnimeProvider } from '../providers/allanime.provider'
import { AnimePaheProvider } from '../providers/animepahe.provider'
import { performWriteTransaction } from '../sync'
import { WatchlistRepository } from '../repositories/watchlist.repository'
import {
  WatchedEpisodesRepository,
  ContinueWatchingResult,
  UpNextResult,
  WatchedEpisode,
} from '../repositories/watched-episodes.repository'
import { ShowsMetaRepository } from '../repositories/shows-meta.repository'
import { NotificationsRepository } from '../repositories/notifications.repository'
import { QueueRepository } from '../repositories/queue.repository'
import { SearchOptions } from '../providers/provider.interface'
import { SettingsRepository } from '../repositories/settings.repository'
import { discordRPCService } from '../discord-rpc'
import { requestContext } from '../utils/request-context'
import { dbAll } from '../utils/db-utils'
import { searchAnilistByTitle, getAiredEpisodesForShows } from '../lib/anilist'

interface CombinedContinueWatchingShow {
  _id: string
  id: string
  name: string
  thumbnail?: string
  nativeName?: string
  englishName?: string
  episodeNumber?: string | number
  relativeEpisodeNumber?: number | string
  currentTime?: number
  duration?: number
  episodeCount?: number
  watchedCount?: number
  nextEpisodeToWatch?: string
  newEpisodesCount?: number
  type?: string
  smType?: string
}

interface EpisodeNotification {
  showId: string
  name: string
  nativeName?: string
  englishName?: string
  thumbnail: string
  episodeNumber: string
  id: string
}

interface WatchlistFilterOptions {
  query?: string
  type?: string
  season?: string
  year?: string
  country?: string
  translation?: string
  genres?: string
  excludeGenres?: string
  tags?: string
  excludeTags?: string
  studios?: string
  sortBy?: string
  titlePreference?: 'name' | 'nativeName' | 'englishName'
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class WatchlistController {
  private activeTypeFetches = new Set<string>()
  private allAnime: AllAnimeProvider
  private animePahe?: AnimePaheProvider

  constructor(providers: { allAnime: AllAnimeProvider; animePahe?: AnimePaheProvider }) {
    this.allAnime = providers.allAnime
    this.animePahe = providers.animePahe
  }

  startNotificationDiscovery(getDb: () => DatabaseWrapper): void {
    let busy = false
    const anilistIdCache = new Map<string, number | null>()

    const getAnilistId = async (showId: string, showName: string): Promise<number | null> => {
      if (/^\d+$/.test(showId)) {
        return parseInt(showId)
      }

      if (anilistIdCache.has(showId)) {
        return anilistIdCache.get(showId) || null
      }

      const result = await searchAnilistByTitle(showName)
      const id = result?.id || null
      anilistIdCache.set(showId, id)
      return id
    }

    setInterval(async () => {
      if (busy) return
      busy = true

      const db = getDb()
      if (!db || db.isClosedCheck()) {
        busy = false
        return
      }

      try {
        const watchingShows = await WatchlistRepository.getWatchingShows(db)
        if (watchingShows.length === 0) {
          busy = false
          return
        }

        const showIdMap = new Map<string, number>()
        for (const show of watchingShows) {
          const anilistId = await getAnilistId(show.id, show.name)
          if (anilistId) {
            showIdMap.set(show.id, anilistId)
          }
        }

        if (showIdMap.size === 0) {
          busy = false
          return
        }

        const now = new Date()
        const weekStart = new Date(now)
        weekStart.setDate(now.getDate() - 7)
        weekStart.setHours(0, 0, 0, 0)
        const weekEnd = new Date(now)
        weekEnd.setHours(23, 59, 59, 999)

        const schedules = await getAiredEpisodesForShows(
          Array.from(showIdMap.values()),
          weekStart,
          weekEnd
        )

        const nowUnix = Math.floor(Date.now() / 1000)
        const reverseMap = new Map<number, string>()
        for (const [watchlistId, anilistId] of showIdMap.entries()) {
          reverseMap.set(anilistId, watchlistId)
        }

        for (const entry of schedules) {
          if (entry.airingAt > nowUnix) continue

          const watchlistId = reverseMap.get(entry.mediaId)
          if (!watchlistId) continue

          const [watchedEps, dismissedEps] = await Promise.all([
            WatchedEpisodesRepository.getWatchedEpisodeNumbers(db, watchlistId),
            NotificationsRepository.getDismissedByShow(db, watchlistId),
          ])

          const watchedSet = new Set(watchedEps.map((e) => e.toString()))
          const dismissedSet = new Set(dismissedEps.map((e) => e.episodeNumber.toString()))

          if (
            !watchedSet.has(entry.episode.toString()) &&
            !dismissedSet.has(entry.episode.toString())
          ) {
            await NotificationsRepository.addDiscovered(db, watchlistId, entry.episode.toString())
            db.scheduleSave()
          }
        }
      } catch (e) {
        logger.error({ err: e }, 'AniList notification discovery failed')
      } finally {
        busy = false
      }
    }, 300000)
  }

  private getProviderForId(showId: string): AllAnimeProvider | AnimePaheProvider {
    if (UUID_RE.test(showId) && this.animePahe) return this.animePahe
    return this.allAnime
  }

  private deobfuscateUrl(url: string, showId?: string): string {
    if (!showId || !UUID_RE.test(showId)) {
      return this.allAnime.deobfuscateUrl(url)
    }
    return url
  }

  private normalizeFilterValue(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    return trimmed && trimmed !== 'ALL' ? trimmed : undefined
  }

  private getWatchlistFilters(query: Request['query']): WatchlistFilterOptions {
    return {
      query: this.normalizeFilterValue(query.query),
      type: this.normalizeFilterValue(query.type),
      season: this.normalizeFilterValue(query.season),
      year: this.normalizeFilterValue(query.year),
      country: this.normalizeFilterValue(query.country),
      translation: this.normalizeFilterValue(query.translation),
      genres: this.normalizeFilterValue(query.genres),
      excludeGenres: this.normalizeFilterValue(query.excludeGenres),
      tags: this.normalizeFilterValue(query.tags),
      excludeTags: this.normalizeFilterValue(query.excludeTags),
      studios: this.normalizeFilterValue(query.studios),
      sortBy: this.normalizeFilterValue(query.sortBy),
      titlePreference: ['name', 'nativeName', 'englishName'].includes(String(query.titlePreference))
        ? (query.titlePreference as 'name' | 'nativeName' | 'englishName')
        : 'name',
    }
  }

  private hasProviderFilters(filters: WatchlistFilterOptions): boolean {
    return !!(
      filters.season ||
      filters.year ||
      filters.country ||
      filters.translation ||
      filters.genres ||
      filters.excludeGenres ||
      filters.tags ||
      filters.excludeTags ||
      filters.studios
    )
  }

  private matchesLocalFilters<
    T extends { name?: string; nativeName?: string; englishName?: string; type?: string },
  >(row: T, filters: WatchlistFilterOptions): boolean {
    if (filters.query) {
      const needle = filters.query.toLowerCase()
      const haystack = [row.name, row.nativeName, row.englishName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(needle)) return false
    }

    if (filters.type && row.type !== filters.type) return false

    return true
  }

  private sortFilteredRows<T extends { name?: string; nativeName?: string; englishName?: string }>(
    rows: T[],
    filters: WatchlistFilterOptions
  ): T[] {
    const getSortTitle = (row: T) => {
      const preferredTitle = filters.titlePreference ? row[filters.titlePreference] : undefined
      return preferredTitle || row.name || ''
    }

    if (filters.sortBy === 'name_asc') {
      return [...rows].sort((a, b) => getSortTitle(a).localeCompare(getSortTitle(b)))
    }
    if (filters.sortBy === 'name_desc') {
      return [...rows].sort((a, b) => getSortTitle(b).localeCompare(getSortTitle(a)))
    }
    return rows
  }

  private async getProviderMatchedIds(filters: WatchlistFilterOptions): Promise<Set<string>> {
    if (!this.hasProviderFilters(filters)) return new Set()

    const searchOptions: SearchOptions = {
      season: filters.season,
      year: filters.year,
      country: filters.country,
      translation: filters.translation,
      genres: filters.genres,
      excludeGenres: filters.excludeGenres,
      tags: filters.tags,
      excludeTags: filters.excludeTags,
      studios: filters.studios,
    }

    const ids = new Set<string>()
    const maxPages = 25

    for (let page = 1; page <= maxPages; page += 1) {
      const results = await this.allAnime.search({ ...searchOptions, page: String(page) })
      for (const show of results) ids.add(show._id)
      if (results.length < 28) break
      await new Promise((res) => setImmediate(res))
    }

    return ids
  }

  private async filterWatchlistRows<
    T extends {
      id: string
      name?: string
      nativeName?: string
      englishName?: string
      type?: string
    },
  >(rows: T[], filters: WatchlistFilterOptions): Promise<T[]> {
    let filtered = rows.filter((row) => this.matchesLocalFilters(row, filters))

    if (this.hasProviderFilters(filters)) {
      const matchedIds = await this.getProviderMatchedIds(filters)
      filtered = filtered.filter((row) => matchedIds.has(row.id))
    }

    return this.sortFilteredRows(filtered, filters)
  }

  private async getContinueWatchingData(
    req: Request,
    limit?: number
  ): Promise<CombinedContinueWatchingShow[]> {
    const rows = await WatchedEpisodesRepository.getContinueWatching(req.db, limit)

    const enrichedRows = rows.map((show) => ({
      ...show,
      relativeEpisodeNumber: show.episodeNumber,
      episodeCount: show.episodeCount,
      type: show.type || show.smType,
      thumbnail: this.deobfuscateUrl(show.thumbnail ?? '', show.id),
    }))

    return enrichedRows
  }

  getAllContinueWatching = async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 10
    const offset = (page - 1) * limit
    const filters = this.getWatchlistFilters(req.query)
    const data = await this.filterWatchlistRows(await this.getContinueWatchingData(req), filters)

    res.json({
      data: data.slice(offset, offset + limit),
      total: data.length,
      page,
      limit,
    })
  }

  updateProgress = async (req: Request, res: Response) => {
    const {
      showId,
      episodeNumber,
      currentTime,
      duration,
      showName,
      showThumbnail,
      nativeName,
      englishName,
      genres,
      popularityScore,
      type,
      status,
      episodeCount,
      isPlaying,
      sessionId,
    } = req.body

    const titlePreferenceRow = await SettingsRepository.getByKey(req.db, 'titlePreference')
    const titlePreference = titlePreferenceRow ? titlePreferenceRow.value : 'englishName'

    let displayName = showName
    if (titlePreference === 'englishName' && englishName) {
      displayName = englishName
    } else if (titlePreference === 'nativeName' && nativeName) {
      displayName = nativeName
    }

    let actualEpisodeNumber = episodeNumber
    if (this.getProviderForId(showId).name === 'AnimePahe') {
      const epData = await this.getProviderForId(showId).getEpisodes(
        showId,
        'sub',
        req.headers['x-animepahe-ua'] as string,
        req.headers['x-animepahe-cookie'] as string
      )
      if (epData && epData.episodes) {
        const epList = epData.episodes.sort((a, b) => parseFloat(a) - parseFloat(b))
        const idx = epList.indexOf(String(episodeNumber))
        if (idx !== -1) {
          actualEpisodeNumber = idx + 1
        }
      }
    }

    let discordThumbnails: string[] | undefined
    try {
      const meta = await this.getProviderForId(showId).getShowMeta(showId)
      if (meta?.thumbnails) discordThumbnails = meta.thumbnails
    } catch {
      // Non-critical, Discord will fall back to logo
    }

    discordRPCService.updatePresence({
      title: displayName,
      episode: String(actualEpisodeNumber),
      totalEpisodes: episodeCount ? String(episodeCount) : undefined,
      currentTime: currentTime || 0,
      duration: duration || 0,
      thumbnail: this.deobfuscateUrl(showThumbnail || '', showId),
      isPlaying: isPlaying !== false,
      providerName: this.getProviderForId(showId).name,
      sessionId,
      thumbnails: discordThumbnails,
    })

    const genresStr = Array.isArray(genres) ? JSON.stringify(genres) : genres

    await performWriteTransaction(req.db, (tx) => {
      ShowsMetaRepository.upsert(tx, {
        id: showId,
        name: showName,
        thumbnail: this.deobfuscateUrl(showThumbnail, showId),
        nativeName,
        englishName,
        genres: genresStr,
        popularityScore,
        status,
        episodeCount,
        type,
      })

      WatchedEpisodesRepository.upsert(tx, {
        showId,
        episodeNumber,
        currentTime,
        duration,
      })

      NotificationsRepository.deleteSpecificDismissed(tx, showId, episodeNumber)
    })

    req.db.scheduleSave()
    res.json({ success: true })
  }

  removeContinueWatching = async (req: Request, res: Response) => {
    const { showId } = req.body
    await performWriteTransaction(req.db, (tx) => {
      WatchedEpisodesRepository.deleteByShow(tx, showId)
      NotificationsRepository.deleteByShow(tx, showId)
    })
    res.json({ success: true })
  }

  getWatchlist = async (req: Request, res: Response) => {
    const { status, page: pageStr, limit: limitStr } = req.query
    const page = parseInt(pageStr as string) || 1
    const limit = parseInt(limitStr as string) || 10
    const offset = (page - 1) * limit
    const filters = this.getWatchlistFilters(req.query)

    const allRows = await WatchlistRepository.getAll(req.db, status as string)
    const filteredRows = await this.filterWatchlistRows(allRows, filters)
    const rows = filteredRows.slice(offset, offset + limit)

    res.json({
      data: rows.map((row) => ({
        ...row,
        _id: row.id,
        thumbnail: this.deobfuscateUrl(row.thumbnail || '', row.id),
      })),
      total: filteredRows.length,
      page,
      limit,
    })

    setImmediate(async () => {
      if (req.db.isClosedCheck()) return
      const delay = () => new Promise((res) => setImmediate(res))
      for (const row of rows) {
        const currentThumbnail = row.thumbnail || ''
        const fixedThumbnail = this.deobfuscateUrl(currentThumbnail, row.id)
        const needsThumbnailUpdate = fixedThumbnail !== currentThumbnail

        if ((!row.type || needsThumbnailUpdate) && !this.activeTypeFetches.has(row.id)) {
          this.activeTypeFetches.add(row.id)
          try {
            let didUpdate = false
            if (needsThumbnailUpdate && !req.db.isClosedCheck()) {
              await WatchlistRepository.updateThumbnail(req.db, row.id, fixedThumbnail)
              await ShowsMetaRepository.updateThumbnail(req.db, row.id, fixedThumbnail)
              didUpdate = true
            }

            if (!row.type) {
              const meta = await this.getProviderForId(row.id).getShowMeta(
                row.id,
                req.headers['x-animepahe-ua'] as string,
                req.headers['x-animepahe-cookie'] as string
              )
              if (meta && !req.db.isClosedCheck()) {
                if (meta.type) {
                  await WatchlistRepository.updateType(req.db, row.id, meta.type)
                  await ShowsMetaRepository.updateType(req.db, row.id, meta.type)
                  didUpdate = true
                }
                if (meta.thumbnail) {
                  const metaThumb = this.deobfuscateUrl(meta.thumbnail, row.id)
                  if (metaThumb !== fixedThumbnail) {
                    await WatchlistRepository.updateThumbnail(req.db, row.id, metaThumb)
                    await ShowsMetaRepository.updateThumbnail(req.db, row.id, metaThumb)
                    didUpdate = true
                  }
                }
              }
            }
            if (didUpdate) req.db.scheduleSave()
          } catch (e) {
            logger.error({ err: e, showId: row.id }, 'Watchlist lazy migration error')
          } finally {
            this.activeTypeFetches.delete(row.id)
          }
          await delay()
        }
      }
    })
  }

  checkWatchlist = async (req: Request, res: Response) => {
    const item = await WatchlistRepository.getById(req.db, req.params.showId as string)
    res.json({ inWatchlist: !!item, status: item?.status ?? null })
  }

  getQueue = async (req: Request, res: Response) => {
    const rows = await QueueRepository.getAll(req.db)
    res.json(
      rows.map((row) => ({
        ...row,
        _id: row.showId,
        id: row.id,
        thumbnail: this.deobfuscateUrl(row.thumbnail || '', row.showId),
      }))
    )
  }

  addToQueue = async (req: Request, res: Response) => {
    const { showId, episodeNumber, showName, showThumbnail, nativeName, englishName, type } =
      req.body

    if (!showId || !episodeNumber) {
      return res.status(400).json({ error: 'showId and episodeNumber are required' })
    }

    const existing = await QueueRepository.getByEpisode(req.db, showId, String(episodeNumber))

    await performWriteTransaction(req.db, (tx) => {
      if (showName || showThumbnail || nativeName || englishName || type) {
        ShowsMetaRepository.upsert(tx, {
          id: showId,
          name: showName || '',
          thumbnail: this.deobfuscateUrl(showThumbnail || '', showId),
          nativeName,
          englishName,
          type,
        })
      }

      if (existing) {
        QueueRepository.removeEpisode(tx, showId, String(episodeNumber))
      } else {
        QueueRepository.addToEnd(tx, showId, String(episodeNumber))
      }
    })

    req.db.scheduleSave()
    res.json({ success: true, queued: !existing })
  }

  removeFromQueue = async (req: Request, res: Response) => {
    const { showId, episodeNumber } = req.body
    await performWriteTransaction(req.db, (tx) => {
      QueueRepository.removeEpisode(tx, showId, String(episodeNumber))
    })
    res.json({ success: true })
  }

  clearQueue = async (req: Request, res: Response) => {
    await performWriteTransaction(req.db, (tx) => {
      QueueRepository.clear(tx)
    })
    res.json({ success: true })
  }

  reorderQueue = async (req: Request, res: Response) => {
    const { items } = req.body
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items must be an array' })
    }

    await performWriteTransaction(req.db, (tx) => {
      QueueRepository.reorder(tx, items)
    })
    res.json({ success: true })
  }

  getSuggestedQueueEpisode = async (req: Request, res: Response) => {
    const showId = req.params.showId as string
    const resumeProgress = await WatchedEpisodesRepository.getLatestResumeProgress(req.db, showId)

    if (resumeProgress) {
      return res.json({
        showId,
        episodeNumber: resumeProgress.episodeNumber,
        resumeTime: resumeProgress.currentTime || 0,
      })
    }

    const [watchedEpisodes, episodeData] = await Promise.all([
      WatchedEpisodesRepository.getByShow(req.db, showId),
      this.getProviderForId(showId)
        .getEpisodes(showId, 'sub')
        .catch(() => null),
    ])

    const watchedSet = new Set(watchedEpisodes.map((ep) => ep.episodeNumber.toString()))
    const episodes = episodeData?.episodes?.length
      ? [...episodeData.episodes].sort((a, b) => parseFloat(a) - parseFloat(b))
      : []

    const finishedEpisodes = watchedEpisodes
      .filter((ep) => ep.duration > 0 && ep.currentTime >= ep.duration * 0.8)
      .map((ep) => parseFloat(ep.episodeNumber))
      .filter((ep) => !Number.isNaN(ep))

    const nextAfterFinished =
      finishedEpisodes.length > 0 ? String(Math.max(...finishedEpisodes) + 1) : undefined

    const episodeNumber =
      (nextAfterFinished &&
      episodes.includes(nextAfterFinished) &&
      !watchedSet.has(nextAfterFinished)
        ? nextAfterFinished
        : episodes.find((ep) => !watchedSet.has(ep))) ||
      episodes[0] ||
      '1'

    res.json({ showId, episodeNumber, resumeTime: 0 })
  }

  getEpisodeProgress = async (req: Request, res: Response) => {
    const progress = await WatchedEpisodesRepository.getByShowAndEpisode(
      req.db,
      req.params.showId as string,
      req.params.episodeNumber as string
    )
    res.json(progress || { currentTime: 0, duration: 0 })
  }

  getWatchedEpisodes = async (req: Request, res: Response) => {
    const episodes = await WatchedEpisodesRepository.getWatchedEpisodeNumbers(
      req.db,
      req.params.showId as string
    )
    res.json(episodes)
  }

  addToWatchlist = async (req: Request, res: Response) => {
    const { id, status, nativeName, englishName } = req.body
    let { name, thumbnail, type } = req.body

    if (id && !id.startsWith('show_')) {
      try {
        const meta = await this.getProviderForId(id).getShowMeta(
          id,
          req.headers['x-animepahe-ua'] as string,
          req.headers['x-animepahe-cookie'] as string
        )
        if (meta && meta.type) {
          if (!type || type === 'TV') type = meta.type
          if (meta.name && !name) name = meta.name
          if (meta.thumbnail && !thumbnail) thumbnail = meta.thumbnail
        }
      } catch (e) {
        logger.warn({ id, err: e }, 'Failed to fetch metadata, proceeding with provided data')
      }
    }

    await performWriteTransaction(req.db, (tx) => {
      WatchlistRepository.upsert(tx, {
        id,
        name,
        thumbnail: this.deobfuscateUrl(thumbnail, id),
        status: status || 'Watching',
        nativeName: nativeName || '',
        englishName: englishName || '',
        type: type || 'TV',
      })
    })

    await req.db.saveNow()
    res.json({ success: true })
  }

  removeFromWatchlist = async (req: Request, res: Response) => {
    const { id } = req.body
    await performWriteTransaction(req.db, (tx) => {
      WatchlistRepository.delete(tx, id)
      WatchedEpisodesRepository.deleteByShow(tx, id)
      NotificationsRepository.deleteByShow(tx, id)
    })
    res.json({ success: true })
  }

  updateWatchlistStatus = async (req: Request, res: Response) => {
    const { id, status } = req.body
    await performWriteTransaction(req.db, (tx) => {
      WatchlistRepository.updateStatus(tx, id, status)
    })
    res.json({ success: true })
  }

  getNotifications = async (req: Request, res: Response) => {
    const db = req.db
    const watchingShows = await WatchlistRepository.getWatchingShows(db)

    const notifications: EpisodeNotification[] = []

    for (const show of watchingShows) {
      try {
        const [watchedEps, dismissedEps, discoveredEps] = await Promise.all([
          WatchedEpisodesRepository.getWatchedEpisodeNumbers(db, show.id),
          NotificationsRepository.getDismissedByShow(db, show.id),
          NotificationsRepository.getDiscoveredByShow(db, show.id),
        ])

        const watchedSet = new Set(watchedEps.map((e) => e.toString()))
        const dismissedSet = new Set(dismissedEps.map((e) => e.episodeNumber.toString()))
        const maxWatched = Math.max(0, ...Array.from(watchedSet).map((e) => parseFloat(e)))

        for (const discovered of discoveredEps) {
          const epNum = parseFloat(discovered.episodeNumber)
          if (
            epNum > maxWatched &&
            !watchedSet.has(discovered.episodeNumber) &&
            !dismissedSet.has(discovered.episodeNumber)
          ) {
            notifications.push({
              showId: show.id,
              name: show.name,
              nativeName: show.nativeName,
              englishName: show.englishName,
              thumbnail: this.deobfuscateUrl(show.thumbnail, show.id),
              episodeNumber: discovered.episodeNumber,
              id: `${show.id}-${discovered.episodeNumber}`,
            })
          }
        }
      } catch (e) {
        logger.error({ err: e, showId: show.id }, 'Failed to get notifications for show')
      }
    }

    res.json(
      notifications.sort((a, b) => parseFloat(b.episodeNumber) - parseFloat(a.episodeNumber))
    )
  }

  dismissNotification = async (req: Request, res: Response) => {
    const { showId, episodeNumber } = req.body
    await performWriteTransaction(req.db, (tx) => {
      NotificationsRepository.addDismissed(tx, showId, episodeNumber)
    })
    res.json({ success: true })
  }

  clearAllNotifications = async (req: Request, res: Response) => {
    const { showId } = req.body
    await performWriteTransaction(req.db, (tx) => {
      NotificationsRepository.dismissFromDiscovered(tx, showId)
    })
    res.json({ success: true })
  }

  getThisWeekSchedule = async (req: Request, res: Response) => {
    const rows = await dbAll<{
      id: string
      name: string
      thumbnail: string
      nativeName?: string
      englishName?: string
      type?: string
      episodeNumber: string
      discoveredAt: string
    }>(
      req.db,
      `SELECT
        w.id, w.name, w.thumbnail, w.nativeName, w.englishName, w.type,
        dn.episodeNumber, dn.discoveredAt
      FROM discovered_notifications dn
      JOIN watchlist w ON dn.showId = w.id
      WHERE w.status = 'Watching'
        AND dn.discoveredAt = (
          SELECT MAX(dn2.discoveredAt)
          FROM discovered_notifications dn2
          WHERE dn2.showId = dn.showId
            AND dn2.discoveredAt >= datetime('now', '-7 days')
            AND NOT EXISTS (
              SELECT 1 FROM watched_episodes we2
              WHERE we2.showId = dn2.showId AND we2.episodeNumber = dn2.episodeNumber
            )
        )
        AND NOT EXISTS (
          SELECT 1 FROM watched_episodes we
          WHERE we.showId = dn.showId AND we.episodeNumber = dn.episodeNumber
        )
      ORDER BY dn.discoveredAt DESC`
    )

    res.json(
      rows.map((row) => ({
        _id: row.id,
        id: row.id,
        name: row.name,
        thumbnail: this.deobfuscateUrl(row.thumbnail || '', row.id),
        nativeName: row.nativeName,
        englishName: row.englishName,
        type: row.type,
        episodeNumber: parseInt(row.episodeNumber) || row.episodeNumber,
      }))
    )
  }
}
