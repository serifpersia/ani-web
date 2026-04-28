import { DatabaseWrapper } from '../db'
import { dbGet, dbRun } from '../utils/db-utils'

export const ShowsMetaRepository = {
  getById: (db: DatabaseWrapper, id: string) =>
    dbGet<unknown>(db, 'SELECT * FROM shows_meta WHERE id = ?', [id]),

  getStatus: async (db: DatabaseWrapper, id: string) => {
    const row = await dbGet<{ status: string }>(db, 'SELECT status FROM shows_meta WHERE id = ?', [
      id,
    ])
    return row?.status
  },

  upsert: (
    db: DatabaseWrapper,
    data: {
      id: string
      name?: string
      thumbnail?: string
      nativeName?: string
      englishName?: string
      genres?: string
      popularityScore?: number
      status?: string
      episodeCount?: number
      type?: string
    }
  ) =>
    dbRun(
      db,
      `INSERT INTO shows_meta (id, name, thumbnail, nativeName, englishName, genres, popularityScore, status, episodeCount, type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, shows_meta.name),
         thumbnail = COALESCE(EXCLUDED.thumbnail, shows_meta.thumbnail),
         nativeName = COALESCE(EXCLUDED.nativeName, shows_meta.nativeName),
         englishName = COALESCE(EXCLUDED.englishName, shows_meta.englishName),
         genres = COALESCE(EXCLUDED.genres, shows_meta.genres),
         popularityScore = COALESCE(EXCLUDED.popularityScore, shows_meta.popularityScore),
         status = COALESCE(EXCLUDED.status, shows_meta.status),
         episodeCount = COALESCE(EXCLUDED.episodeCount, shows_meta.episodeCount),
         type = COALESCE(EXCLUDED.type, shows_meta.type)`,
      [
        data.id,
        data.name,
        data.thumbnail,
        data.nativeName || '',
        data.englishName || '',
        data.genres || '',
        data.popularityScore || 0,
        data.status || '',
        data.episodeCount || 0,
        data.type || '',
      ]
    ),

  updateEpisodeCount: (db: DatabaseWrapper, id: string, episodeCount: number) =>
    dbRun(db, 'UPDATE shows_meta SET episodeCount = ? WHERE id = ?', [episodeCount, id]),

  updateType: (db: DatabaseWrapper, id: string, type: string) =>
    dbRun(db, 'UPDATE shows_meta SET type = ? WHERE id = ?', [type, id]),
}
