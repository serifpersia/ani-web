import { DatabaseWrapper } from '../db'
import { dbAll, dbGet, dbRun } from '../utils/db-utils'

export interface WatchedEpisode {
  showId: string
  episodeNumber: string
  currentTime: number
  duration: number
  watchedAt: string
}

export interface ContinueWatchingResult {
  _id: string
  id: string
  name: string
  thumbnail: string
  nativeName?: string
  englishName?: string
  type?: string
  episodeCount?: number
  smType?: string
  watchedCount: number
  episodeNumber: string
  currentTime: number
  duration: number
  watchedAt: string
}

export interface UpNextResult {
  id: string
  name: string
  thumbnail: string
  nativeName?: string
  englishName?: string
  type?: string
  episodeCount?: number
  smType?: string
}

export const WatchedEpisodesRepository = {
  getByShowAndEpisode: (db: DatabaseWrapper, showId: string, episodeNumber: string) =>
    dbGet<{ currentTime: number; duration: number }>(
      db,
      'SELECT currentTime, duration FROM watched_episodes WHERE showId = ? AND episodeNumber = ?',
      [showId, episodeNumber]
    ),

  getWatchedEpisodeNumbers: async (db: DatabaseWrapper, showId: string) => {
    const rows = await dbAll<{ episodeNumber: string }>(
      db,
      'SELECT episodeNumber FROM watched_episodes WHERE showId = ?',
      [showId]
    )
    return rows.map((r) => r.episodeNumber)
  },

  upsert: (
    db: DatabaseWrapper,
    data: {
      showId: string
      episodeNumber: string
      currentTime: number
      duration: number
    }
  ) =>
    dbRun(
      db,
      'INSERT OR REPLACE INTO watched_episodes (showId, episodeNumber, watchedAt, currentTime, duration) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)',
      [data.showId, data.episodeNumber, data.currentTime, data.duration]
    ),

  deleteByShow: (db: DatabaseWrapper, showId: string) =>
    dbRun(db, 'DELETE FROM watched_episodes WHERE showId = ?', [showId]),

  getContinueWatching: (db: DatabaseWrapper, limit?: number) => {
    const limitClause = typeof limit === 'number' ? `LIMIT ${limit}` : ''
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
      ORDER BY we.watchedAt DESC
      ${limitClause}
    `
    return dbAll<ContinueWatchingResult>(db, query)
  },

  getUpNextShows: (db: DatabaseWrapper) => {
    const query = `
      SELECT w.id, w.name, w.thumbnail, w.nativeName, w.englishName, w.type, sm.episodeCount, sm.type as smType
      FROM watchlist w
      LEFT JOIN shows_meta sm ON w.id = sm.id
      LEFT JOIN (
        SELECT showId, MAX(watchedAt) as lastActivity
        FROM watched_episodes
        GROUP BY showId
      ) we ON w.id = we.showId
      WHERE w.status = 'Watching'
      ORDER BY we.lastActivity DESC
      LIMIT 15
    `
    return dbAll<UpNextResult>(db, query)
  },

  getEpisodesForShows: (db: DatabaseWrapper, showIds: string[]) => {
    const placeholders = showIds.map(() => '?').join(',')
    return dbAll<WatchedEpisode>(
      db,
      `SELECT showId, episodeNumber, currentTime, duration, watchedAt FROM watched_episodes WHERE showId IN (${placeholders})`,
      showIds
    )
  },
}
