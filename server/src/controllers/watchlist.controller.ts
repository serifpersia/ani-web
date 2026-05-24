import { Request, Response } from 'express'
import logger from '../logger'
import { AllAnimeProvider } from '../providers/allanime.provider'
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
import { asyncHandler } from '../utils/async-handler'

interface CombinedContinueWatchingShow {
  _id: string
  id: string
  name: string
  thumbnail?: string
  nativeName?: string
  englishName?: string
  episodeNumber?: string | number
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

export class WatchlistController {
  private activeTypeFetches = new Set<string>()

  constructor(private provider: AllAnimeProvider) {}

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
      const results = await this.provider.search({ ...searchOptions, page: String(page) })
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

    const showsNeedingEpisodes = rows.filter((show) => {
      const watchedCount = show.watchedCount || 0
      return !show.episodeCount || (watchedCount > 0 && show.episodeCount <= watchedCount)
    })

    const episodeFetchResults = new Map<string, number>()
    if (showsNeedingEpisodes.length > 0) {
      const BATCH_SIZE = 5
      for (let i = 0; i < showsNeedingEpisodes.length; i += BATCH_SIZE) {
        const batch = showsNeedingEpisodes.slice(i, i + BATCH_SIZE)
        const batchResults = await Promise.allSettled(
          batch.map((show) => this.provider.getEpisodes(show.id, 'sub'))
        )

        batch.forEach((show, index) => {
          const result = batchResults[index]
          if (result.status === 'fulfilled' && result.value?.episodes) {
            const epCount = result.value.episodes.length
            episodeFetchResults.set(show.id, epCount)
            ShowsMetaRepository.updateEpisodeCount(req.db, show.id, epCount).catch((e) => {
              logger.error({ err: e, showId: show.id }, 'Failed to update episode count in DB')
            })
          }
        })
      }
    }

    const enrichedRows = rows.map((show) => {
      const epCount = episodeFetchResults.get(show.id) ?? show.episodeCount
      return {
        ...show,
        episodeCount: epCount,
        type: show.type || show.smType,
        thumbnail: this.provider.deobfuscateUrl(show.thumbnail ?? ''),
      }
    })

    setImmediate(async () => {
      if (req.db.isClosedCheck()) return
      const delay = () => new Promise((res) => setImmediate(res))
      for (const show of enrichedRows) {
        const currentThumbnail = show.thumbnail || ''
        const fixedThumbnail = this.provider.deobfuscateUrl(currentThumbnail)
        const needsThumbnailUpdate = fixedThumbnail !== currentThumbnail

        if ((!show.type || needsThumbnailUpdate) && !this.activeTypeFetches.has(show.id)) {
          this.activeTypeFetches.add(show.id)
          try {
            let didUpdate = false
            if (needsThumbnailUpdate && !req.db.isClosedCheck()) {
              await WatchlistRepository.updateThumbnail(req.db, show.id, fixedThumbnail)
              await ShowsMetaRepository.updateThumbnail(req.db, show.id, fixedThumbnail)
              didUpdate = true
            }

            if (!show.type) {
              const meta = await this.provider.getShowMeta(show.id)
              if (meta && meta.type && !req.db.isClosedCheck()) {
                await ShowsMetaRepository.updateType(req.db, show.id, meta.type)
                await WatchlistRepository.updateType(req.db, show.id, meta.type)
                didUpdate = true
              }
            }
            if (didUpdate) req.db.scheduleSave()
          } catch (e) {
            logger.error({ err: e, showId: show.id }, 'Lazy migration error for show')
          } finally {
            this.activeTypeFetches.delete(show.id)
          }
          await delay()
        }
      }
    })

    return enrichedRows
  }

  private async getUpNextShowsData(req: Request): Promise<CombinedContinueWatchingShow[]> {
    const watchingShows = await WatchedEpisodesRepository.getUpNextShows(req.db)
    if (watchingShows.length === 0) return []

    const showIds = watchingShows.map((s) => s.id)
    const allWatchedEps = await WatchedEpisodesRepository.getEpisodesForShows(req.db, showIds)

    const watchedByShow = new Map<string, WatchedEpisode[]>()
    for (const ep of allWatchedEps) {
      const arr = watchedByShow.get(ep.showId)
      if (arr) arr.push(ep)
      else watchedByShow.set(ep.showId, [ep])
    }

    const BATCH_SIZE = 5
    const upNextShows: CombinedContinueWatchingShow[] = []

    for (let i = 0; i < watchingShows.length; i += BATCH_SIZE) {
      const batch = watchingShows.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.allSettled(
        batch.map(async (show) => {
          try {
            const epDetails = await this.provider.getEpisodes(show.id, 'sub')
            const watchedEpisodesResult = watchedByShow.get(show.id) ?? []
            const allEps = epDetails?.episodes?.sort((a, b) => parseFloat(a) - parseFloat(b)) || []
            const watchedEpsMap = new Map(
              watchedEpisodesResult.map((r) => [r.episodeNumber.toString(), r])
            )
            const unwatchedEps = allEps.filter((ep) => !watchedEpsMap.has(ep))

            if (unwatchedEps.length > 0) {
              return {
                _id: show.id,
                id: show.id,
                name: show.name,
                thumbnail: this.provider.deobfuscateUrl(show.thumbnail ?? ''),
                nativeName: show.nativeName,
                englishName: show.englishName,
                type: show.type || show.smType,
                nextEpisodeToWatch: unwatchedEps[0],
                newEpisodesCount: unwatchedEps.length,
                episodeCount: allEps.length,
                watchedCount: watchedEpsMap.size,
              } as CombinedContinueWatchingShow
            }
            return null
          } catch (e) {
            logger.error({ err: e, showId: show.id }, 'Error processing show for Up Next list')
            return null
          }
        })
      )
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          upNextShows.push(result.value)
        }
      }

      if (i + BATCH_SIZE < watchingShows.length) {
        await new Promise((res) => setImmediate(res))
      }
    }

    return upNextShows
  }

  getContinueWatchingFast = asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 10
    const data = await this.getContinueWatchingData(req, limit)
    res.json(data)
  })

  getContinueWatchingUpNext = asyncHandler(async (req: Request, res: Response) => {
    const data = await this.getUpNextShowsData(req)
    res.json(data)
  })

  getContinueWatching = asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 10
    const data = await this.getContinueWatchingData(req)
    res.json(data.slice(0, limit))
  })

  getAllContinueWatching = asyncHandler(async (req: Request, res: Response) => {
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
  })

  updateProgress = asyncHandler(async (req: Request, res: Response) => {
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
    } = req.body

    const inWatchlist = await WatchlistRepository.exists(req.db, showId)
    if (!inWatchlist) {
      return res.json({ success: true })
    }

    const genresStr = Array.isArray(genres) ? JSON.stringify(genres) : genres

    await performWriteTransaction(req.db, (tx) => {
      ShowsMetaRepository.upsert(tx, {
        id: showId,
        name: showName,
        thumbnail: this.provider.deobfuscateUrl(showThumbnail),
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
  })

  removeContinueWatching = asyncHandler(async (req: Request, res: Response) => {
    const { showId } = req.body
    await performWriteTransaction(req.db, (tx) => {
      WatchedEpisodesRepository.deleteByShow(tx, showId)
      NotificationsRepository.deleteByShow(tx, showId)
    })
    res.json({ success: true })
  })

  getWatchlist = asyncHandler(async (req: Request, res: Response) => {
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
        thumbnail: this.provider.deobfuscateUrl(row.thumbnail || ''),
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
        const fixedThumbnail = this.provider.deobfuscateUrl(currentThumbnail)
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
              const meta = await this.provider.getShowMeta(row.id)
              if (meta && !req.db.isClosedCheck()) {
                if (meta.type) {
                  await WatchlistRepository.updateType(req.db, row.id, meta.type)
                  await ShowsMetaRepository.updateType(req.db, row.id, meta.type)
                  didUpdate = true
                }
                if (meta.thumbnail) {
                  const metaThumb = this.provider.deobfuscateUrl(meta.thumbnail)
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
  })

  checkWatchlist = asyncHandler(async (req: Request, res: Response) => {
    const item = await WatchlistRepository.getById(req.db, req.params.showId as string)
    res.json({ inWatchlist: !!item, status: item?.status ?? null })
  })

  getQueue = asyncHandler(async (req: Request, res: Response) => {
    const rows = await QueueRepository.getAll(req.db)
    res.json(
      rows.map((row) => ({
        ...row,
        _id: row.showId,
        id: row.id,
        thumbnail: this.provider.deobfuscateUrl(row.thumbnail || ''),
      }))
    )
  })

  addToQueue = asyncHandler(async (req: Request, res: Response) => {
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
          thumbnail: this.provider.deobfuscateUrl(showThumbnail || ''),
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
  })

  removeFromQueue = asyncHandler(async (req: Request, res: Response) => {
    const { showId, episodeNumber } = req.body
    await performWriteTransaction(req.db, (tx) => {
      QueueRepository.removeEpisode(tx, showId, String(episodeNumber))
    })
    res.json({ success: true })
  })

  clearQueue = asyncHandler(async (req: Request, res: Response) => {
    await performWriteTransaction(req.db, (tx) => {
      QueueRepository.clear(tx)
    })
    res.json({ success: true })
  })

  reorderQueue = asyncHandler(async (req: Request, res: Response) => {
    const { items } = req.body
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items must be an array' })
    }

    await performWriteTransaction(req.db, (tx) => {
      QueueRepository.reorder(tx, items)
    })
    res.json({ success: true })
  })

  getSuggestedQueueEpisode = asyncHandler(async (req: Request, res: Response) => {
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
      this.provider.getEpisodes(showId, 'sub').catch(() => null),
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
  })

  getEpisodeProgress = asyncHandler(async (req: Request, res: Response) => {
    const progress = await WatchedEpisodesRepository.getByShowAndEpisode(
      req.db,
      req.params.showId as string,
      req.params.episodeNumber as string
    )
    res.json(progress || { currentTime: 0, duration: 0 })
  })

  getWatchedEpisodes = asyncHandler(async (req: Request, res: Response) => {
    const episodes = await WatchedEpisodesRepository.getWatchedEpisodeNumbers(
      req.db,
      req.params.showId as string
    )
    res.json(episodes)
  })

  addToWatchlist = asyncHandler(async (req: Request, res: Response) => {
    const { id, status, nativeName, englishName } = req.body
    let { name, thumbnail, type } = req.body

    if (id && !id.startsWith('show_')) {
      try {
        const meta = await this.provider.getShowMeta(id)
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
        thumbnail: this.provider.deobfuscateUrl(thumbnail),
        status: status || 'Watching',
        nativeName: nativeName || '',
        englishName: englishName || '',
        type: type || 'TV',
      })
    })

    await req.db.saveNow()
    res.json({ success: true })
  })

  removeFromWatchlist = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.body
    await performWriteTransaction(req.db, (tx) => {
      WatchlistRepository.delete(tx, id)
      WatchedEpisodesRepository.deleteByShow(tx, id)
      NotificationsRepository.deleteByShow(tx, id)
    })
    res.json({ success: true })
  })

  updateWatchlistStatus = asyncHandler(async (req: Request, res: Response) => {
    const { id, status } = req.body
    await performWriteTransaction(req.db, (tx) => {
      WatchlistRepository.updateStatus(tx, id, status)
    })
    res.json({ success: true })
  })

  getNotifications = asyncHandler(async (req: Request, res: Response) => {
    const db = req.db
    const watchingShows = await WatchlistRepository.getWatchingShows(db)

    const notifications: EpisodeNotification[] = []
    const BATCH_SIZE = 5

    for (let i = 0; i < watchingShows.length; i += BATCH_SIZE) {
      const batch = watchingShows.slice(i, i + BATCH_SIZE)
      await Promise.allSettled(
        batch.map(async (show) => {
          try {
            const [epDetails, watchedEps, dismissedEps, showStatus, discoveredEps] =
              await Promise.all([
                this.provider.getEpisodes(show.id, 'sub'),
                WatchedEpisodesRepository.getWatchedEpisodeNumbers(db, show.id),
                NotificationsRepository.getDismissedByShow(db, show.id),
                ShowsMetaRepository.getStatus(db, show.id),
                NotificationsRepository.getDiscoveredByShow(db, show.id),
              ])

            if (!epDetails || !epDetails.episodes || epDetails.episodes.length === 0) return

            if (showStatus && !['Ongoing', 'Releasing', 'Currently Airing'].includes(showStatus)) {
              return
            }

            const watchedSet = new Set(watchedEps.map((e) => e.toString()))
            const dismissedSet = new Set(dismissedEps.map((e) => e.episodeNumber.toString()))
            const discoveredSet = new Set(discoveredEps.map((e) => e.episodeNumber.toString()))

            const maxWatched = Math.max(0, ...Array.from(watchedSet).map((e) => parseFloat(e)))
            const episodes = epDetails.episodes
            const sortedEpisodes = [...episodes].sort((a, b) => parseFloat(a) - parseFloat(b))
            const latestAvailable = sortedEpisodes[sortedEpisodes.length - 1]

            if (
              parseFloat(latestAvailable) > maxWatched &&
              !watchedSet.has(latestAvailable.toString()) &&
              !dismissedSet.has(latestAvailable.toString()) &&
              !discoveredSet.has(latestAvailable.toString())
            ) {
              await NotificationsRepository.addDiscovered(db, show.id, latestAvailable.toString())
              discoveredSet.add(latestAvailable.toString())
            }

            Array.from(discoveredSet).forEach((epStr: string) => {
              const epNum = parseFloat(epStr)
              if (epNum > maxWatched && !watchedSet.has(epStr) && !dismissedSet.has(epStr)) {
                notifications.push({
                  showId: show.id,
                  name: show.name,
                  nativeName: show.nativeName,
                  englishName: show.englishName,
                  thumbnail: this.provider.deobfuscateUrl(show.thumbnail),
                  episodeNumber: epStr,
                  id: `${show.id}-${epStr}`,
                })
              }
            })
          } catch (e) {
            logger.error({ err: e, showId: show.id }, 'Failed to fetch notifications for show')
          }
        })
      )

      if (i + BATCH_SIZE < watchingShows.length) {
        await new Promise((res) => setImmediate(res))
      }
    }

    res.json(
      notifications.sort((a, b) => parseFloat(b.episodeNumber) - parseFloat(a.episodeNumber))
    )
  })

  dismissNotification = asyncHandler(async (req: Request, res: Response) => {
    const { showId, episodeNumber } = req.body
    await performWriteTransaction(req.db, (tx) => {
      NotificationsRepository.addDismissed(tx, showId, episodeNumber)
    })
    res.json({ success: true })
  })

  clearAllNotifications = asyncHandler(async (req: Request, res: Response) => {
    const { showId } = req.body
    await performWriteTransaction(req.db, (tx) => {
      NotificationsRepository.dismissFromDiscovered(tx, showId)
    })
    res.json({ success: true })
  })
}
