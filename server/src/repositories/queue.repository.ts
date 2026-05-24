import { DatabaseWrapper } from '../db'
import { dbAll, dbGet, dbRun } from '../utils/db-utils'

export interface QueueRow {
  id: number
  showId: string
  episodeNumber: string
  queue_order: number
  name?: string
  thumbnail?: string
  nativeName?: string
  englishName?: string
  type?: string
}

export interface SuggestedEpisode {
  showId: string
  episodeNumber: string
  resumeTime: number
}

export const QueueRepository = {
  getAll: (db: DatabaseWrapper) =>
    dbAll<QueueRow>(
      db,
      `SELECT
        q.id,
        q.showId,
        q.episodeNumber,
        q.queue_order,
        COALESCE(sm.name, w.name) as name,
        COALESCE(sm.thumbnail, w.thumbnail) as thumbnail,
        COALESCE(sm.nativeName, w.nativeName) as nativeName,
        COALESCE(sm.englishName, w.englishName) as englishName,
        COALESCE(sm.type, w.type) as type
      FROM queue q
      LEFT JOIN shows_meta sm ON q.showId = sm.id
      LEFT JOIN watchlist w ON q.showId = w.id
      ORDER BY q.queue_order ASC, q.id ASC`
    ),

  getByEpisode: (db: DatabaseWrapper, showId: string, episodeNumber: string) =>
    dbGet<QueueRow>(db, 'SELECT * FROM queue WHERE showId = ? AND episodeNumber = ?', [
      showId,
      episodeNumber,
    ]),

  getMaxOrder: async (db: DatabaseWrapper) => {
    const row = await dbGet<{ maxOrder: number }>(
      db,
      'SELECT COALESCE(MAX(queue_order), -1) as maxOrder FROM queue'
    )
    return row?.maxOrder ?? -1
  },

  addToEnd: (db: DatabaseWrapper, showId: string, episodeNumber: string) =>
    dbRun(
      db,
      'INSERT INTO queue (showId, episodeNumber, queue_order) VALUES (?, ?, (SELECT COALESCE(MAX(queue_order), -1) + 1 FROM queue))',
      [showId, episodeNumber]
    ),

  removeEpisode: (db: DatabaseWrapper, showId: string, episodeNumber: string) =>
    dbRun(db, 'DELETE FROM queue WHERE showId = ? AND episodeNumber = ?', [showId, episodeNumber]),

  clear: (db: DatabaseWrapper) => dbRun(db, 'DELETE FROM queue'),

  reorder: (
    db: DatabaseWrapper,
    items: { id?: number; showId?: string; episodeNumber?: string }[]
  ) =>
    Promise.all(
      items.map((item, index) => {
        if (item.id !== undefined) {
          return dbRun(db, 'UPDATE queue SET queue_order = ? WHERE id = ?', [index, item.id])
        }
        return dbRun(
          db,
          'UPDATE queue SET queue_order = ? WHERE showId = ? AND episodeNumber = ?',
          [index, item.showId, item.episodeNumber]
        )
      })
    ),

  cleanupOrphanedShowsMeta: (db: DatabaseWrapper) =>
    dbRun(
      db,
      'DELETE FROM shows_meta WHERE id NOT IN (SELECT id FROM watchlist) AND id NOT IN (SELECT showId FROM queue)'
    ),
}
