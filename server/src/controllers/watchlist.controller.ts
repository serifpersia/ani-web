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
import { dbAll, dbGet } from '../utils/db-utils'
import {
  searchAnilist,
  searchAnilistByTitle,
  getAiredEpisodesForShows,
  getShowMetaById,
} from '../lib/anilist'
import { getMigratedId } from '../lib/migration'

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
  genres?: string
  excludeGenres?: string
  sortBy?: string
  titlePreference?: 'name' | 'nativeName' | 'englishName'
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class WatchlistController {
  private activeTypeFetches = new Set<string>()
  private lastFinishedStatusCheckAt = 0
  private allAnime: AllAnimeProvider
  private animePahe?: AnimePaheProvider
  private triggerDiscovery?: () => void

  constructor(providers: { allAnime: AllAnimeProvider; animePahe?: AnimePaheProvider }) {
    this.allAnime = providers.allAnime
    this.animePahe = providers.animePahe
  }

  startNotificationDiscovery(getDb: () => DatabaseWrapper): void {
    let busy = false
    const anilistIdCache = new Map<string, number | null>()

    const getAnilistId = async (showId: string, showName: string): Promise<number | null> => {
      if (anilistIdCache.has(showId)) {
        return anilistIdCache.get(showId) || null
      }

      const db = getDb()
      const meta = (await ShowsMetaRepository.getById(db, showId)) as { anilistId?: number } | null
      if (meta?.anilistId) {
        anilistIdCache.set(showId, meta.anilistId)
        return meta.anilistId
      }

      const result = await searchAnilistByTitle(showName)
      const id = result?.id || null
      anilistIdCache.set(showId, id)
      if (id && db && !db.isClosedCheck()) {
        ShowsMetaRepository.upsert(db, { id: showId, anilistId: id })
        db.scheduleSave()
      }
      if (id) return id

      if (/^\d+$/.test(showId)) {
        return parseInt(showId)
      }

      return null
    }

    const runDiscovery = async (): Promise<void> => {
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

        const finishedShowIds = new Set<number>()
        const refreshFinishedStatuses =
          Date.now() - this.lastFinishedStatusCheckAt >= 60 * 60 * 1000
        for (const [watchlistId, anilistId] of showIdMap.entries()) {
          const localMeta = (await ShowsMetaRepository.getById(db, watchlistId)) as {
            status?: string
          } | null
          if (localMeta?.status === 'FINISHED') {
            finishedShowIds.add(anilistId)
          } else if (refreshFinishedStatuses) {
            try {
              const meta = await getShowMetaById(String(anilistId))
              if (meta?.status === 'FINISHED') {
                finishedShowIds.add(anilistId)
              }
            } catch {
              // ignore AniList lookup failure
            }
          }
        }
        if (refreshFinishedStatuses) {
          this.lastFinishedStatusCheckAt = Date.now()
        }

        if (finishedShowIds.size > 0) {
          const monthStart = new Date(now)
          monthStart.setDate(now.getDate() - 30)
          monthStart.setHours(0, 0, 0, 0)
          const monthEnd = new Date(now)
          monthEnd.setHours(23, 59, 59, 999)

          const finishedSchedules = await getAiredEpisodesForShows(
            Array.from(finishedShowIds),
            monthStart,
            monthEnd
          )

          for (const entry of finishedSchedules) {
            if (entry.airingAt > nowUnix) continue
            const latestAired = Math.max(
              ...finishedSchedules.filter((s) => s.mediaId === entry.mediaId).map((s) => s.airingAt)
            )
            if (nowUnix - latestAired > 30 * 24 * 60 * 60) continue

            const watchlistId = reverseMap.get(entry.mediaId)
            if (!watchlistId) continue

            const [watchedEps, dismissedEps] = await Promise.all([
              WatchedEpisodesRepository.getWatchedEpisodeNumbers(db, watchlistId),
              NotificationsRepository.getDismissedByShow(db, watchlistId),
            ])

            const watchedSet = new Set(watchedEps.map((e) => e.toString()))
            const dismissedSet = new Set(dismissedEps.map((e) => e.episodeNumber.toString()))
            const episodeKey = String(Math.round(entry.episode))

            if (!watchedSet.has(episodeKey) && !dismissedSet.has(episodeKey)) {
              await NotificationsRepository.addDiscovered(db, watchlistId, episodeKey)
              db.scheduleSave()
            }
          }
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
          const episodeKey = String(Math.round(entry.episode))

          if (!watchedSet.has(episodeKey) && !dismissedSet.has(episodeKey)) {
            await NotificationsRepository.addDiscovered(db, watchlistId, episodeKey)
            db.scheduleSave()
          }
        }
      } catch (e) {
        logger.error({ err: e }, 'AniList notification discovery failed')
      } finally {
        busy = false
      }
    }

    this.triggerDiscovery = () => runDiscovery()

    setInterval(runDiscovery, 300000)
    runDiscovery()
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
      genres: this.normalizeFilterValue(query.genres),
      excludeGenres: this.normalizeFilterValue(query.excludeGenres),
      sortBy: this.normalizeFilterValue(query.sortBy),
      titlePreference: ['name', 'nativeName', 'englishName'].includes(String(query.titlePreference))
        ? (query.titlePreference as 'name' | 'nativeName' | 'englishName')
        : 'name',
    }
  }

  private matchesLocalFilters<
    T extends { name?: string; nativeName?: string; englishName?: string; type?: string },
  >(row: T, filters: WatchlistFilterOptions): boolean {
    if (filters.query) {
      const queryWords = new Set(
        filters.query
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length >= 2)
      )
      const rowTitle = (row.englishName || row.name || row.nativeName || '').toLowerCase()
      const titleWords = rowTitle.split(/\s+/)
      const overlap = titleWords.filter((w) => queryWords.has(w)).length
      if (overlap < queryWords.size) return false
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

  private async getAnilistSeasonYearMatches(
    season?: string,
    year?: string
  ): Promise<Map<number, { title: { romaji?: string; english?: string; native?: string } }>> {
    const matched = new Map<
      number,
      { title: { romaji?: string; english?: string; native?: string } }
    >()

    if (!year || year === 'ALL') {
      return matched
    }

    const seasonYear = parseInt(year)
    if (Number.isNaN(seasonYear)) return matched

    const perPage = 50
    let page = 1

    while (true) {
      const searchVars: Record<string, unknown> = {
        seasonYear,
        page,
        perPage,
      }
      if (season && season !== 'ALL') {
        searchVars.season = season.toUpperCase()
      }

      const results = await searchAnilist(searchVars)

      for (const show of results) {
        if (show.anilistId) {
          matched.set(show.anilistId, { title: show.names || {} })
        }
      }

      if (results.length < perPage) break
      page++
      if (page > 10) break
    }

    return matched
  }

  private rowMatchesAnilistSeasonYear<
    T extends { id: string; name?: string; nativeName?: string; englishName?: string },
  >(
    row: T,
    anilistMatches: Map<number, { title: { romaji?: string; english?: string; native?: string } }>
  ): boolean {
    if (anilistMatches.size === 0) return true

    if (/^\d+$/.test(row.id) && anilistMatches.has(parseInt(row.id))) {
      return true
    }

    const rowTitle = (row.englishName || row.name || row.nativeName || '').toLowerCase()
    if (!rowTitle) return false

    const rowWords = new Set(rowTitle.split(/\s+/).filter((w) => w.length >= 2))
    if (rowWords.size === 0) return false

    for (const [, media] of anilistMatches) {
      const titles = [media.title?.romaji, media.title?.english, media.title?.native].filter(
        Boolean
      ) as string[]
      for (const title of titles) {
        const titleWords = new Set(
          title
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length >= 2)
        )
        const overlap = [...rowWords].filter((w) => titleWords.has(w)).length
        const minLen = Math.min(rowWords.size, titleWords.size)
        if (minLen >= 2 && overlap / minLen >= 0.7) return true
      }
    }

    return false
  }

  private async filterWatchlistRows<
    T extends {
      id: string
      name?: string
      nativeName?: string
      englishName?: string
      type?: string
    },
  >(rows: T[], filters: WatchlistFilterOptions, db?: DatabaseWrapper): Promise<T[]> {
    let filtered = rows.filter((row) => this.matchesLocalFilters(row, filters))

    if ((filters.genres || filters.excludeGenres) && db) {
      const ids = filtered.map((r) => r.id)
      const placeholders = ids.map(() => '?').join(',')
      const genreRows = await dbAll<{ id: string; genres: string | null }>(
        db,
        `SELECT id, genres FROM shows_meta WHERE id IN (${placeholders})`,
        ids
      )
      const idToGenres = new Map(
        genreRows.map((r) => [r.id, r.genres ? (JSON.parse(r.genres) as string[]) : []])
      )
      const includeList = filters.genres?.split(',') || []
      const excludeList = filters.excludeGenres?.split(',') || []

      filtered = filtered.filter((row) => {
        const rowGenres: string[] = idToGenres.get(row.id) || []
        if (includeList.length && !includeList.every((g) => rowGenres.includes(g))) return false
        if (excludeList.length && excludeList.some((g) => rowGenres.includes(g))) return false
        return true
      })
    }

    if (
      ((filters.season && filters.season !== 'ALL') || (filters.year && filters.year !== 'ALL')) &&
      filtered.length > 0
    ) {
      const anilistMatches = await this.getAnilistSeasonYearMatches(filters.season, filters.year)
      if (anilistMatches.size > 0) {
        filtered = filtered.filter((row) => this.rowMatchesAnilistSeasonYear(row, anilistMatches))
      }
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
    const data = await this.filterWatchlistRows(
      await this.getContinueWatchingData(req),
      filters,
      req.db
    )

    res.json({
      data: data.slice(offset, offset + limit),
      total: data.length,
      page,
      limit,
    })
  }

  updateProgress = async (req: Request, res: Response) => {
    const {
      showId: showIdRaw,
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
      isAdult,
    } = req.body

    const showId = await getMigratedId(req.db, showIdRaw, {
      allanime: this.allAnime,
      animepahe: this.animePahe,
    })

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
      isAdult,
    })

    const genresStr = Array.isArray(genres) ? JSON.stringify(genres) : genres
    const anilistId = /^\d+$/.test(showId)
      ? (dbGet<{ anilistId: number }>(
          req.db,
          'SELECT anilistId FROM shows_meta WHERE id = ? AND anilistId IS NOT NULL',
          [showId]
        )?.anilistId ?? parseInt(showId))
      : undefined

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
        anilistId,
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
    const { showId: showIdRaw } = req.body
    const showId = await getMigratedId(req.db, showIdRaw, {
      allanime: this.allAnime,
      animepahe: this.animePahe,
    })
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
    const filteredRows = await this.filterWatchlistRows(allRows, filters, req.db)
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
    const showId = await getMigratedId(req.db, req.params.showId as string, {
      allanime: this.allAnime,
      animepahe: this.animePahe,
    })
    const item = await WatchlistRepository.getById(req.db, showId)
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
    const {
      showId: showIdRaw,
      episodeNumber,
      showName,
      showThumbnail,
      nativeName,
      englishName,
      type,
    } = req.body

    if (!showIdRaw || !episodeNumber) {
      return res.status(400).json({ error: 'showId and episodeNumber are required' })
    }

    const showId = await getMigratedId(req.db, showIdRaw, {
      allanime: this.allAnime,
      animepahe: this.animePahe,
    })

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
    const { showId: showIdRaw, episodeNumber } = req.body
    const showId = await getMigratedId(req.db, showIdRaw, {
      allanime: this.allAnime,
      animepahe: this.animePahe,
    })
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
    const showIdRaw = req.params.showId as string
    const showId = await getMigratedId(req.db, showIdRaw, {
      allanime: this.allAnime,
      animepahe: this.animePahe,
    })
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
    const showId = await getMigratedId(req.db, req.params.showId as string, {
      allanime: this.allAnime,
      animepahe: this.animePahe,
    })
    const progress = await WatchedEpisodesRepository.getByShowAndEpisode(
      req.db,
      showId,
      req.params.episodeNumber as string
    )
    res.json(progress || { currentTime: 0, duration: 0 })
  }

  getWatchedEpisodes = async (req: Request, res: Response) => {
    const showId = await getMigratedId(req.db, req.params.showId as string, {
      allanime: this.allAnime,
      animepahe: this.animePahe,
    })
    const episodes = await WatchedEpisodesRepository.getWatchedEpisodeNumbers(req.db, showId)
    res.json(episodes)
  }

  addToWatchlist = async (req: Request, res: Response) => {
    const { id: idRaw, status, nativeName, englishName } = req.body
    let { name, thumbnail, type } = req.body
    const id = await getMigratedId(req.db, idRaw, {
      allanime: this.allAnime,
      animepahe: this.animePahe,
    })

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
    const { id: idRaw } = req.body
    const id = await getMigratedId(req.db, idRaw, {
      allanime: this.allAnime,
      animepahe: this.animePahe,
    })
    await performWriteTransaction(req.db, (tx) => {
      WatchlistRepository.delete(tx, id)
      WatchedEpisodesRepository.deleteByShow(tx, id)
      NotificationsRepository.deleteByShow(tx, id)
    })
    res.json({ success: true })
  }

  updateWatchlistStatus = async (req: Request, res: Response) => {
    const { id: idRaw, status } = req.body
    const id = await getMigratedId(req.db, idRaw, {
      allanime: this.allAnime,
      animepahe: this.animePahe,
    })
    await performWriteTransaction(req.db, (tx) => {
      WatchlistRepository.updateStatus(tx, id, status)
    })
    res.json({ success: true })
  }

  getNotifications = async (req: Request, res: Response) => {
    const db = req.db
    const watchingShows = await WatchlistRepository.getWatchingShows(db)

    if (this.triggerDiscovery && watchingShows.length > 0) {
      this.triggerDiscovery()
    }

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

        for (const discovered of discoveredEps) {
          if (
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
        AND dn.episodeNumber = (
          SELECT MAX(CAST(dn2.episodeNumber AS INTEGER))
          FROM discovered_notifications dn2
          WHERE dn2.showId = dn.showId
            AND dn2.discoveredAt >= datetime('now', '-7 days')
            AND NOT EXISTS (
              SELECT 1 FROM watched_episodes we2
              WHERE we2.showId = dn2.showId AND we2.episodeNumber = dn2.episodeNumber
            )
        )
        AND dn.discoveredAt >= datetime('now', '-7 days')
        AND NOT EXISTS (
          SELECT 1 FROM watched_episodes we
          WHERE we.showId = dn.showId AND we.episodeNumber = dn.episodeNumber
        )
      ORDER BY CAST(dn.episodeNumber AS INTEGER) DESC`
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
