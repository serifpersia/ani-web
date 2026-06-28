import { DatabaseWrapper } from '../db'
import { dbAll, dbGet, dbRun } from '../utils/db-utils'

export interface WatchlistRow {
  id: string
  name: string
  thumbnail: string
  status: string
  nativeName?: string
  englishName?: string
  type?: string
  [key: string]: unknown
}

export const WatchlistRepository = {
  getById: (db: DatabaseWrapper, id: string) =>
    dbGet<WatchlistRow>(db, 'SELECT * FROM watchlist WHERE id = ?', [id]),

  exists: (db: DatabaseWrapper, id: string) => {
    const row = dbGet<{ inWatchlist: number }>(
      db,
      'SELECT EXISTS(SELECT 1 FROM watchlist WHERE id = ?) as inWatchlist',
      [id]
    )
    return !!(row && row.inWatchlist)
  },

  getAll: (db: DatabaseWrapper, status?: string, limit?: number, offset?: number) => {
    let query = 'SELECT * FROM watchlist'
    const params: (string | number)[] = []

    if (status && status !== 'All') {
      query += ' WHERE status = ?'
      params.push(status)
    }

    query += ' ORDER BY rowid DESC'

    if (limit !== undefined && offset !== undefined) {
      query += ' LIMIT ? OFFSET ?'
      params.push(limit, offset)
    }

    return dbAll<WatchlistRow>(db, query, params)
  },

  getCount: (db: DatabaseWrapper, status?: string) => {
    let query = 'SELECT COUNT(*) as total FROM watchlist'
    const params: string[] = []

    if (status && status !== 'All') {
      query += ' WHERE status = ?'
      params.push(status)
    }

    const row = dbGet<{ total: number }>(db, query, params)
    return row?.total || 0
  },

  upsert: (
    db: DatabaseWrapper,
    data: {
      id: string
      name: string
      thumbnail: string
      status: string
      nativeName: string
      englishName: string
      type: string
    }
  ) =>
    dbRun(
      db,
      'INSERT OR REPLACE INTO watchlist (id, name, thumbnail, status, nativeName, englishName, type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        data.id,
        data.name,
        data.thumbnail,
        data.status,
        data.nativeName,
        data.englishName,
        data.type,
      ]
    ),

  updateStatus: (db: DatabaseWrapper, id: string, status: string) =>
    dbRun(db, 'UPDATE watchlist SET status = ? WHERE id = ?', [status, id]),

  updateType: (db: DatabaseWrapper, id: string, type: string) =>
    dbRun(db, 'UPDATE watchlist SET type = ? WHERE id = ?', [type, id]),

  updateThumbnail: (db: DatabaseWrapper, id: string, thumbnail: string) =>
    dbRun(db, 'UPDATE watchlist SET thumbnail = ? WHERE id = ?', [thumbnail, id]),

  delete: (db: DatabaseWrapper, id: string) =>
    dbRun(db, 'DELETE FROM watchlist WHERE id = ?', [id]),

  getWatchingShows: (db: DatabaseWrapper) =>
    dbAll<{
      id: string
      name: string
      thumbnail: string
      nativeName?: string
      englishName?: string
    }>(
      db,
      "SELECT id, name, thumbnail, nativeName, englishName FROM watchlist WHERE status = 'Watching'"
    ),

  getShowsWithNewEpisodes: (db: DatabaseWrapper) =>
    dbAll<{
      id: string
      name: string
      thumbnail: string
      nativeName?: string
      englishName?: string
      type?: string
      episodeCount?: number
      smType?: string
      smStatus?: string
      latestDiscoveredEpisode: string
    }>(
      db,
      `SELECT
        w.id,
        w.name,
        w.thumbnail,
        w.nativeName,
        w.englishName,
        w.type,
        sm.episodeCount,
        sm.type as smType,
        sm.status as smStatus,
        dn.episodeNumber as latestDiscoveredEpisode
      FROM watchlist w
      JOIN discovered_notifications dn ON w.id = dn.showId
      LEFT JOIN shows_meta sm ON w.id = sm.id
      WHERE w.status = 'Watching'
        AND dn.discoveredAt >= date('now', '-7 days')
        AND NOT EXISTS (
          SELECT 1 FROM watched_episodes we
          WHERE we.showId = w.id AND we.episodeNumber = dn.episodeNumber
        )
        AND dn.discoveredAt = (
          SELECT MAX(dn2.discoveredAt)
          FROM discovered_notifications dn2
          WHERE dn2.showId = dn.showId
            AND dn2.discoveredAt >= date('now', '-7 days')
            AND NOT EXISTS (
              SELECT 1 FROM watched_episodes we2
              WHERE we2.showId = dn2.showId AND we2.episodeNumber = dn2.episodeNumber
            )
        )
      ORDER BY dn.discoveredAt DESC`
    ),
}
