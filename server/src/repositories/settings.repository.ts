import { DatabaseWrapper } from '../db'
import { dbGet, dbRun } from '../utils/db-utils'

export const SettingsRepository = {
  getByKey: (db: DatabaseWrapper, key: string) =>
    dbGet<{ value: string }>(db, 'SELECT value FROM settings WHERE key = ?', [key]),

  upsert: (db: DatabaseWrapper, key: string, value: string) =>
    dbRun(db, 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]),

  clearWatchlist: (db: DatabaseWrapper) => dbRun(db, 'DELETE FROM watchlist'),

  upsertWatchlistBatch: (
    db: DatabaseWrapper,
    shows: { id: string; name: string; thumbnail?: string; status: string }[]
  ) => {
    const stmt = db.prepare(
      'INSERT OR REPLACE INTO watchlist (id, name, thumbnail, status) VALUES (?, ?, ?, ?)'
    )
    shows.forEach((show) => stmt.run(show.id, show.name, show.thumbnail, show.status))
  },
}
