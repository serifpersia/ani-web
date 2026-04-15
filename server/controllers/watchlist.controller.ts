import { Request, Response } from 'express'
import logger from '../logger'
import { AllAnimeProvider } from '../providers/allanime.provider'
import { performWriteTransaction } from '../sync'
import { DatabaseWrapper } from '../db'

interface WatchedEpisode {
  episodeNumber: string
  currentTime: number
  duration: number
  watchedAt: string
}

interface ContinueWatchingShow {
  _id: string
  id: string
  name: string
  thumbnail?: string
  nativeName?: string
  englishName?: string
  episodeNumber: string
  currentTime: number
  duration: number
}

interface WatchingShow {
  id: string
  name: string
  thumbnail?: string
  nativeName?: string
  englishName?: string
  lastWatchedAt: string | null
  type?: string
  smType?: string
}

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

interface WatchlistRow {
  id: string
  name: string
  thumbnail: string
  status: string
  nativeName?: string
  englishName?: string
  type?: string
  [key: string]: unknown
}

export class WatchlistController {
  constructor(private provider: AllAnimeProvider) {}

  private async getContinueWatchingData(
    db: DatabaseWrapper
  ): Promise<CombinedContinueWatchingShow[]> {
    const query = `
    SELECT 
    w.id as _id, 
    w.id as id, 
    w.name as name, 
    w.thumbnail as thumbnail, 
    w.nativeName as nativeName, 
    w.englishName as englishName,
    w.type as type,
    sm.episodeCount,
    sm.type as smType,
    (SELECT COUNT(DISTINCT episodeNumber) FROM watched_episodes WHERE showId = w.id) as watchedCount,
    we.episodeNumber, we.currentTime, we.duration, we.watchedAt
    FROM (
      SELECT *, ROW_NUMBER() OVER(PARTITION BY showId ORDER BY watchedAt DESC) as rn
      FROM watched_episodes
    ) we
    JOIN watchlist w ON we.showId = w.id
    LEFT JOIN shows_meta sm ON we.showId = sm.id
    WHERE we.rn = 1 AND w.status = 'Watching'
    ORDER BY we.watchedAt DESC;
    `
    const rows: CombinedContinueWatchingShow[] = await new Promise((resolve, reject) => {
      db.all(query, [], (err: Error | null, rows: unknown) => {
        if (err) reject(err)
        else resolve(rows as CombinedContinueWatchingShow[])
      })
    })

    const enrichedRows = await Promise.all(
      rows.map(async (show) => {
        let epCount = show.episodeCount

        // If we don't have the total episode count cached, or the cached total
        // is less-than-or-equal to the number of watched episodes, re-fetch
        // episode details from the provider to get an accurate total.
        const watchedCount = (show.watchedCount as unknown as number) || 0
        if (!epCount || (watchedCount > 0 && epCount <= watchedCount)) {
          try {
            const epDetails = await this.provider.getEpisodes(show.id, 'sub')
            if (epDetails && epDetails.episodes) {
              epCount = epDetails.episodes.length

              // Asynchronously cache it back to the database for future speed
              db.run('UPDATE shows_meta SET episodeCount = ? WHERE id = ?', [epCount, show.id])
            }
          } catch (e) {
            logger.error({ err: e, showId: show.id }, 'Failed to fetch episode count')
          }
        }

        return {
          ...show,
          episodeCount: epCount,
          type: show.type || show.smType,
          thumbnail: this.provider.deobfuscateUrl(show.thumbnail ?? ''),
        }
      })
    )

    // Second pass: asynchronously fetch and update missing metadata (type)
    // We do this in the background without blocking the response
    setImmediate(async () => {
      for (const show of enrichedRows) {
        if (!show.type) {
          try {
            const meta = await this.provider.getShowMeta(show.id)
            if (meta && meta.type) {
              db.run('UPDATE shows_meta SET type = ? WHERE id = ?', [meta.type, show.id])
              db.run('UPDATE watchlist SET type = ? WHERE id = ?', [meta.type, show.id])
              db.scheduleSave() // Uses debounced save instead of blocking loop
            }
          } catch (e) {
            logger.error({ err: e, showId: show.id }, 'Lazy migration error for type')
          }
        }
      }
    })

    return enrichedRows
  }

  private async getInProgressShowsData(
    db: DatabaseWrapper
  ): Promise<CombinedContinueWatchingShow[]> {
    const query = `
    SELECT 
    w.id as _id, 
    w.id as id, 
    w.name as name, 
    w.thumbnail as thumbnail, 
    w.nativeName as nativeName, 
    w.englishName as englishName,
    w.type as type,
    sm.episodeCount,
    sm.type as smType,
    (SELECT COUNT(DISTINCT episodeNumber) FROM watched_episodes WHERE showId = w.id) as watchedCount,
    we.episodeNumber, we.currentTime, we.duration, we.watchedAt
    FROM (
      SELECT *, ROW_NUMBER() OVER(PARTITION BY showId ORDER BY watchedAt DESC) as rn
      FROM watched_episodes
    ) we
    JOIN watchlist w ON we.showId = w.id
    LEFT JOIN shows_meta sm ON we.showId = sm.id
    WHERE we.rn = 1 AND w.status = 'Watching'
    ORDER BY we.watchedAt DESC;
    `
    const rows: CombinedContinueWatchingShow[] = await new Promise((resolve, reject) => {
      db.all(query, [], (err: Error | null, rows: unknown) => {
        if (err) reject(err)
        else resolve(rows as CombinedContinueWatchingShow[])
      })
    })

    return rows.map((show) => ({
      ...show,
      thumbnail: this.provider.deobfuscateUrl(show.thumbnail ?? ''),
    }))
  }

  private async getUpNextShowsData(db: DatabaseWrapper): Promise<CombinedContinueWatchingShow[]> {
    const watchingShows: (WatchingShow & { episodeCount?: number })[] = await new Promise(
      (resolve, reject) => {
        db.all(
          `SELECT w.id, w.name, w.thumbnail, w.nativeName, w.englishName, w.type, sm.episodeCount, sm.type as smType
           FROM watchlist w
           LEFT JOIN shows_meta sm ON w.id = sm.id
           WHERE w.status = 'Watching'`,
          (err: Error | null, rows: unknown) => {
            if (err) reject(err)
            else resolve(rows as (WatchingShow & { episodeCount?: number })[])
          }
        )
      }
    )

    const results: PromiseSettledResult<{
      type: string
      show: CombinedContinueWatchingShow
    } | null>[] = []
    const BATCH_SIZE = 5

    for (let i = 0; i < watchingShows.length; i += BATCH_SIZE) {
      const batch = watchingShows.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.allSettled(
        batch.map(async (show) => {
          try {
            const [epDetails, watchedEpisodesResult] = await Promise.all([
              this.provider.getEpisodes(show.id, 'sub'),
              new Promise<WatchedEpisode[]>((resolve, reject) => {
                db.all(
                  'SELECT * FROM watched_episodes WHERE showId = ?',
                  [show.id],
                  (err: Error | null, rows: unknown) => {
                    if (err) reject(err)
                    else resolve(rows as WatchedEpisode[])
                  }
                )
              }),
            ])

            const allEps = epDetails?.episodes?.sort((a, b) => parseFloat(a) - parseFloat(b)) || []
            const watchedEpsMap = new Map(
              watchedEpisodesResult.map((r) => [r.episodeNumber.toString(), r])
            )

            const unwatchedEps = allEps.filter((ep) => !watchedEpsMap.has(ep))

            if (unwatchedEps.length > 0) {
              return {
                type: 'upNext',
                show: {
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
                },
              }
            }
            return null
          } catch (e) {
            logger.error({ err: e, showId: show.id }, 'Error processing show for Up Next list')
            return null
          }
        })
      )
      results.push(...batchResults)
    }

    const upNextShows: CombinedContinueWatchingShow[] = []
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        if (result.value.type === 'upNext') {
          upNextShows.push(result.value.show as CombinedContinueWatchingShow)
        }
      }
    })

    return upNextShows
  }

  getContinueWatchingFast = async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10
      // Fast path: query DB directly, skip external provider.getEpisodes() calls entirely.
      // Returns stale episodeCount from cache but responds in ~1ms instead of seconds.
      const rows: CombinedContinueWatchingShow[] = await new Promise((resolve, reject) => {
        req.db.all(
          `SELECT
            w.id as _id, w.id as id, w.name, w.thumbnail, w.nativeName, w.englishName, w.type,
            sm.episodeCount, sm.type as smType,
            (SELECT COUNT(DISTINCT episodeNumber) FROM watched_episodes WHERE showId = w.id) as watchedCount,
            we.episodeNumber, we.currentTime, we.duration, we.watchedAt
          FROM (
            SELECT *, ROW_NUMBER() OVER(PARTITION BY showId ORDER BY watchedAt DESC) as rn
            FROM watched_episodes
          ) we
          JOIN watchlist w ON we.showId = w.id
          LEFT JOIN shows_meta sm ON we.showId = sm.id
          WHERE we.rn = 1 AND w.status = 'Watching'
          ORDER BY we.watchedAt DESC
          LIMIT ?`,
          [limit],
          (err: Error | null, rows: unknown) => {
            if (err) reject(err)
            else resolve(rows as CombinedContinueWatchingShow[])
          }
        )
      })
      // For fast responses we still need to guard against stale or missing
      // episode counts. For any show where the cached episodeCount is missing
      // or less-than-or-equal to the watchedCount, refresh from the provider.
      const refreshed = await Promise.all(
        rows.map(async (show) => {
          let epCount = show.episodeCount
          const watchedCount = (show.watchedCount as unknown as number) || 0
          if (!epCount || (watchedCount > 0 && epCount <= watchedCount)) {
            try {
              const epDetails = await this.provider.getEpisodes(show.id, 'sub')
              if (epDetails && epDetails.episodes) {
                epCount = epDetails.episodes.length
                req.db.run('UPDATE shows_meta SET episodeCount = ? WHERE id = ?', [
                  epCount,
                  show.id,
                ])
              }
            } catch (e) {
              logger.error({ err: e, showId: show.id }, 'Failed to refresh episode count (fast)')
            }
          }
          return {
            ...show,
            episodeCount: epCount,
            type: show.type || show.smType,
            thumbnail: this.provider.deobfuscateUrl(show.thumbnail ?? ''),
          }
        })
      )

      res.json(refreshed)
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }

  getContinueWatchingUpNext = async (req: Request, res: Response) => {
    try {
      const data = await this.getUpNextShowsData(req.db)
      res.json(data)
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }

  getContinueWatching = async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10
      const data = await this.getContinueWatchingData(req.db)
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
      const data = await this.getContinueWatchingData(req.db)

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
    } = req.body
    try {
      const genresStr = Array.isArray(genres) ? JSON.stringify(genres) : genres
      const { status, episodeCount } = req.body // Destructure optional new fields

      await performWriteTransaction(req.db, (tx) => {
        tx.run(
          'INSERT OR IGNORE INTO shows_meta (id, name, thumbnail, nativeName, englishName, genres, popularityScore, status, episodeCount, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            showId,
            showName,
            this.provider.deobfuscateUrl(showThumbnail),
            nativeName,
            englishName,
            genresStr,
            popularityScore,
            status,
            episodeCount,
            type,
          ]
        )

        if (status) {
          tx.run('UPDATE shows_meta SET status = ? WHERE id = ?', [status, showId])
        }
        if (episodeCount) {
          tx.run('UPDATE shows_meta SET episodeCount = ? WHERE id = ?', [episodeCount, showId])
        }

        if (genresStr) {
          tx.run('UPDATE shows_meta SET genres = ? WHERE id = ? AND genres IS NULL', [
            genresStr,
            showId,
          ])
        }
        if (popularityScore !== undefined && popularityScore !== null) {
          tx.run('UPDATE shows_meta SET popularityScore = ? WHERE id = ?', [
            popularityScore,
            showId,
          ])
        }
        if (type) {
          tx.run('UPDATE shows_meta SET type = ? WHERE id = ?', [type, showId])
        }

        tx.run(
          `INSERT OR REPLACE INTO watched_episodes (showId, episodeNumber, watchedAt, currentTime, duration) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)`,
          [showId, episodeNumber, currentTime, duration]
        )
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
        tx.run('DELETE FROM watched_episodes WHERE showId = ?', [showId])
        tx.run('DELETE FROM dismissed_notifications WHERE showId = ?', [showId])
        tx.run('DELETE FROM discovered_notifications WHERE showId = ?', [showId])
      })
      res.json({ success: true })
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }

  getWatchlist = (req: Request, res: Response) => {
    const { status, page: pageStr, limit: limitStr } = req.query
    const page = parseInt(pageStr as string) || 1
    const limit = parseInt(limitStr as string) || 10
    const offset = (page - 1) * limit

    let query = 'SELECT * FROM watchlist'
    let countQuery = 'SELECT COUNT(*) as total FROM watchlist'
    const params: (string | number)[] = []

    if (status && status !== 'All') {
      query += ' WHERE status = ?'
      countQuery += ' WHERE status = ?'
      params.push(status as string)
    }

    query += ' ORDER BY rowid DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    req.db.all(query, params, (err: Error | null, rows: unknown[]) => {
      if (err) return res.status(500).json({ error: 'DB error', details: err.message })

      const watchlistRows = rows as WatchlistRow[]

      req.db.get(
        countQuery,
        params.slice(0, -2),
        (countErr: Error | null, countRow: { total: number }) => {
          if (countErr)
            return res.status(500).json({ error: 'DB error', details: countErr.message })
          res.json({
            data: watchlistRows.map((row) => ({ ...row, _id: row.id })),
            total: countRow.total,
            page,
            limit,
          })

          // Asynchronously update missing types for the returned rows
          setImmediate(async () => {
            for (const row of watchlistRows) {
              if (!row.type) {
                try {
                  const meta = await this.provider.getShowMeta(row.id)
                  if (meta && meta.type) {
                    req.db.run('UPDATE watchlist SET type = ? WHERE id = ?', [meta.type, row.id])
                    req.db.run('UPDATE shows_meta SET type = ? WHERE id = ?', [meta.type, row.id])
                    req.db.scheduleSave() // Uses debounced save instead of blocking loop
                  }
                } catch (e) {
                  logger.error({ err: e, showId: row.id }, 'Watchlist lazy migration error')
                }
              }
            }
          })
        }
      )
    })
  }

  checkWatchlist = (req: Request, res: Response) => {
    req.db.get(
      'SELECT EXISTS(SELECT 1 FROM watchlist WHERE id = ?) as inWatchlist',
      [req.params.showId],
      (err: Error | null, row: { inWatchlist: number }) => {
        if (err) return res.status(500).json({ error: 'DB error' })
        res.json({ inWatchlist: !!(row && row.inWatchlist) })
      }
    )
  }

  getEpisodeProgress = (req: Request, res: Response) => {
    req.db.get(
      'SELECT currentTime, duration FROM watched_episodes WHERE showId = ? AND episodeNumber = ?',
      [req.params.showId, req.params.episodeNumber],
      (err: Error | null, row: { currentTime: number; duration: number }) => {
        if (err) return res.status(500).json({ error: 'DB error' })
        res.json(row || { currentTime: 0, duration: 0 })
      }
    )
  }

  getWatchedEpisodes = (req: Request, res: Response) => {
    req.db.all(
      `SELECT episodeNumber FROM watched_episodes WHERE showId = ?`,
      [req.params.showId],
      (err: Error | null, rows: { episodeNumber: string }[]) => {
        if (err) return res.status(500).json({ error: 'DB error' })
        res.json(rows ? rows.map((r) => r.episodeNumber) : [])
      }
    )
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
        tx.run(
          'INSERT OR REPLACE INTO watchlist (id, name, thumbnail, status, nativeName, englishName, type) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            id,
            name,
            this.provider.deobfuscateUrl(thumbnail),
            status || 'Watching',
            nativeName,
            englishName,
            type || 'TV',
          ]
        )
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
        tx.run('DELETE FROM watchlist WHERE id = ?', [id])
        tx.run('DELETE FROM watched_episodes WHERE showId = ?', [id])
        tx.run('DELETE FROM dismissed_notifications WHERE showId = ?', [id])
        tx.run('DELETE FROM discovered_notifications WHERE showId = ?', [id])
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
        tx.run('UPDATE watchlist SET status = ? WHERE id = ?', [status, id])
      })
      res.json({ success: true })
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }

  getNotifications = async (req: Request, res: Response) => {
    try {
      const db = req.db
      const watchingShows: {
        id: string
        name: string
        thumbnail: string
        nativeName?: string
        englishName?: string
      }[] = await new Promise((resolve, reject) => {
        db.all(
          "SELECT id, name, thumbnail, nativeName, englishName FROM watchlist WHERE status = 'Watching'",
          (err: Error | null, rows: unknown) => {
            if (err) reject(err)
            else
              resolve(
                (rows as {
                  id: string
                  name: string
                  thumbnail: string
                  nativeName?: string
                  englishName?: string
                }[]) || []
              )
          }
        )
      })

      const notifications: {
        showId: string
        name: string
        nativeName?: string
        englishName?: string
        thumbnail: string
        episodeNumber: string
        id: string
      }[] = []

      const BATCH_SIZE = 5
      for (let i = 0; i < watchingShows.length; i += BATCH_SIZE) {
        const batch = watchingShows.slice(i, i + BATCH_SIZE)
        await Promise.all(
          batch.map(async (show) => {
            try {
              const [epDetails, watchedEps, dismissedEps, showMeta, discoveredEps] =
                await Promise.all([
                  this.provider.getEpisodes(show.id, 'sub'),
                  new Promise<{ episodeNumber: number | string }[]>((resolve, reject) => {
                    db.all(
                      'SELECT episodeNumber FROM watched_episodes WHERE showId = ?',
                      [show.id],
                      (err, rows) => {
                        if (err) reject(err)
                        else resolve((rows as { episodeNumber: number | string }[]) || [])
                      }
                    )
                  }),
                  new Promise<{ episodeNumber: number | string }[]>((resolve, reject) => {
                    db.all(
                      'SELECT episodeNumber FROM dismissed_notifications WHERE showId = ?',
                      [show.id],
                      (err, rows) => {
                        if (err) reject(err)
                        else resolve((rows as { episodeNumber: number | string }[]) || [])
                      }
                    )
                  }),
                  new Promise<{ status: string }>((resolve) => {
                    db.get('SELECT status FROM shows_meta WHERE id = ?', [show.id], (err, row) =>
                      resolve(row as { status: string })
                    )
                  }),
                  new Promise<{ episodeNumber: number | string }[]>((resolve, reject) => {
                    db.all(
                      'SELECT episodeNumber FROM discovered_notifications WHERE showId = ?',
                      [show.id],
                      (err, rows) => {
                        if (err) reject(err)
                        else resolve((rows as { episodeNumber: number | string }[]) || [])
                      }
                    )
                  }),
                ])

              if (!epDetails || !epDetails.episodes || epDetails.episodes.length === 0) return

              // Only notify for ongoing shows
              if (
                showMeta &&
                showMeta.status &&
                !['Ongoing', 'Releasing', 'Currently Airing'].includes(showMeta.status)
              ) {
                return
              }

              const watchedSet = new Set(watchedEps.map((e) => e.episodeNumber.toString()))
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
                await new Promise<void>((resolve, reject) => {
                  db.run(
                    'INSERT OR IGNORE INTO discovered_notifications (showId, episodeNumber) VALUES (?, ?)',
                    [show.id, latestAvailable.toString()],
                    (err) => {
                      if (err) reject(err)
                      else {
                        discoveredSet.add(latestAvailable.toString())
                        resolve()
                      }
                    }
                  )
                })
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
      } // end for batch loop

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
        tx.run(
          'INSERT OR IGNORE INTO dismissed_notifications (showId, episodeNumber) VALUES (?, ?)',
          [showId, episodeNumber]
        )
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
        if (showId) {
          tx.run(
            'INSERT OR IGNORE INTO dismissed_notifications (showId, episodeNumber) SELECT showId, episodeNumber FROM discovered_notifications WHERE showId = ?',
            [showId]
          )
        } else {
          tx.run(
            'INSERT OR IGNORE INTO dismissed_notifications (showId, episodeNumber) SELECT showId, episodeNumber FROM discovered_notifications'
          )
        }
      })
      res.json({ success: true })
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }
}
