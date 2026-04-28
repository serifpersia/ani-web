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

export class WatchlistController {
  private activeTypeFetches = new Set<string>()

  constructor(private provider: AllAnimeProvider) {}

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
        if (!show.type && !this.activeTypeFetches.has(show.id)) {
          this.activeTypeFetches.add(show.id)
          try {
            const meta = await this.provider.getShowMeta(show.id)
            if (meta && meta.type && !req.db.isClosedCheck()) {
              await ShowsMetaRepository.updateType(req.db, show.id, meta.type)
              await WatchlistRepository.updateType(req.db, show.id, meta.type)
              req.db.scheduleSave()
            }
          } catch (e) {
            logger.error({ err: e, showId: show.id }, 'Lazy migration error for type')
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

  getContinueWatchingFast = async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10
      const data = await this.getContinueWatchingData(req, limit)
      res.json(data)
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }

  getContinueWatchingUpNext = async (req: Request, res: Response) => {
    try {
      const data = await this.getUpNextShowsData(req)
      res.json(data)
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }

  getContinueWatching = async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10
      const data = await this.getContinueWatchingData(req)
      res.json(data.slice(0, limit))
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }

  getAllContinueWatching = async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 10
      const offset = (page - 1) * limit
      const data = await this.getContinueWatchingData(req)

      res.json({
        data: data.slice(offset, offset + limit),
        total: data.length,
        page,
        limit,
      })
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
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
    } = req.body

    try {
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
      })

      req.db.scheduleSave()
      res.json({ success: true })
    } catch (error) {
      logger.error({ err: error, showId }, 'Update progress failed')
      res.status(500).json({ error: 'DB error' })
    }
  }

  removeContinueWatching = async (req: Request, res: Response) => {
    const { showId } = req.body
    try {
      await performWriteTransaction(req.db, (tx) => {
        WatchedEpisodesRepository.deleteByShow(tx, showId)
        NotificationsRepository.deleteByShow(tx, showId)
      })
      res.json({ success: true })
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }

  getWatchlist = async (req: Request, res: Response) => {
    const { status, page: pageStr, limit: limitStr } = req.query
    const page = parseInt(pageStr as string) || 1
    const limit = parseInt(limitStr as string) || 10
    const offset = (page - 1) * limit

    try {
      const [rows, total] = await Promise.all([
        WatchlistRepository.getAll(req.db, status as string, limit, offset),
        WatchlistRepository.getCount(req.db, status as string),
      ])

      res.json({
        data: rows.map((row) => ({ ...row, _id: row.id })),
        total,
        page,
        limit,
      })

      setImmediate(async () => {
        if (req.db.isClosedCheck()) return
        const delay = () => new Promise((res) => setImmediate(res))
        for (const row of rows) {
          if (!row.type && !this.activeTypeFetches.has(row.id)) {
            this.activeTypeFetches.add(row.id)
            try {
              const meta = await this.provider.getShowMeta(row.id)
              if (meta && meta.type && !req.db.isClosedCheck()) {
                await WatchlistRepository.updateType(req.db, row.id, meta.type)
                await ShowsMetaRepository.updateType(req.db, row.id, meta.type)
                req.db.scheduleSave()
              }
            } catch (e) {
              logger.error({ err: e, showId: row.id }, 'Watchlist lazy migration error')
            } finally {
              this.activeTypeFetches.delete(row.id)
            }
            await delay()
          }
        }
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      res.status(500).json({ error: 'DB error', details: message })
    }
  }

  checkWatchlist = async (req: Request, res: Response) => {
    try {
      const inWatchlist = await WatchlistRepository.exists(req.db, req.params.showId as string)
      res.json({ inWatchlist })
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }

  getEpisodeProgress = async (req: Request, res: Response) => {
    try {
      const progress = await WatchedEpisodesRepository.getByShowAndEpisode(
        req.db,
        req.params.showId as string,
        req.params.episodeNumber as string
      )
      res.json(progress || { currentTime: 0, duration: 0 })
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }

  getWatchedEpisodes = async (req: Request, res: Response) => {
    try {
      const episodes = await WatchedEpisodesRepository.getWatchedEpisodeNumbers(
        req.db,
        req.params.showId as string
      )
      res.json(episodes)
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }

  addToWatchlist = async (req: Request, res: Response) => {
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

    try {
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
    } catch (error) {
      logger.error({ err: error, id, name, payload: req.body }, 'Add to watchlist failed')
      res.status(500).json({ error: 'DB error' })
    }
  }

  removeFromWatchlist = async (req: Request, res: Response) => {
    const { id } = req.body
    try {
      await performWriteTransaction(req.db, (tx) => {
        WatchlistRepository.delete(tx, id)
        WatchedEpisodesRepository.deleteByShow(tx, id)
        NotificationsRepository.deleteByShow(tx, id)
      })
      res.json({ success: true })
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }

  updateWatchlistStatus = async (req: Request, res: Response) => {
    const { id, status } = req.body
    try {
      await performWriteTransaction(req.db, (tx) => {
        WatchlistRepository.updateStatus(tx, id, status)
      })
      res.json({ success: true })
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }

  getNotifications = async (req: Request, res: Response) => {
    try {
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

              if (
                showStatus &&
                !['Ongoing', 'Releasing', 'Currently Airing'].includes(showStatus)
              ) {
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
    } catch (e) {
      logger.error({ err: e }, 'Get notifications failed')
      res.status(500).json({ error: 'Failed to fetch notifications' })
    }
  }

  dismissNotification = async (req: Request, res: Response) => {
    const { showId, episodeNumber } = req.body
    try {
      await performWriteTransaction(req.db, (tx) => {
        NotificationsRepository.addDismissed(tx, showId, episodeNumber)
      })
      res.json({ success: true })
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }

  clearAllNotifications = async (req: Request, res: Response) => {
    const { showId } = req.body
    try {
      await performWriteTransaction(req.db, (tx) => {
        NotificationsRepository.dismissFromDiscovered(tx, showId)
      })
      res.json({ success: true })
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }
}
