import { DatabaseWrapper } from '../db'
import { performWriteTransaction } from '../sync'
import { searchAnilistByTitle, getShowMetaById } from './anilist'
import { WatchlistRepository } from '../repositories/watchlist.repository'
import { ShowsMetaRepository } from '../repositories/shows-meta.repository'
import { dbGet, dbRun } from '../utils/db-utils'
import logger from '../logger'
import { Provider } from '../providers/provider.interface'

export async function getMigratedId(
  db: DatabaseWrapper,
  legacyId: string,
  providers: { [key: string]: Provider | undefined }
): Promise<string> {
  const isNumeric = /^\d+$/.test(legacyId)
  if (isNumeric) return legacyId

  try {
    // 1. Check if mapping already exists
    const mapping = dbGet<{ numericId: string }>(
      db,
      'SELECT numericId FROM legacy_id_mapping WHERE legacyId = ?',
      [legacyId]
    )
    if (mapping) {
      return mapping.numericId
    }

    // 2. We need to find the title/name of the show
    let showName: string | undefined

    // Try shows_meta
    const localMeta = (await ShowsMetaRepository.getById(db, legacyId)) as { name?: string } | null
    if (localMeta && localMeta.name) {
      showName = localMeta.name
    } else {
      // Try watchlist
      const watchlistEntry = await WatchlistRepository.getById(db, legacyId)
      if (watchlistEntry && watchlistEntry.name) {
        showName = watchlistEntry.name
      }
    }

    // If not found locally, try providers
    if (!showName) {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(legacyId) ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(legacyId)
      const provider = isUuid ? providers['animepahe'] : providers['allanime']
      if (provider) {
        try {
          const meta = await provider.getShowMeta(legacyId)
          if (meta) {
            showName = meta.name
          }
        } catch (e) {
          logger.warn(
            { id: legacyId, error: (e as Error).message },
            'Failed to fetch provider metadata for migration'
          )
        }
      }
    }

    if (!showName) {
      logger.warn({ id: legacyId }, 'No show name found for legacy ID migration')
      return legacyId
    }

    // 3. Search AniList by title
    const aniListShow = await searchAnilistByTitle(showName)
    if (!aniListShow) {
      logger.warn({ id: legacyId, showName }, 'No AniList match found for legacy ID migration')
      return legacyId
    }

    // 4. Get detailed show meta to obtain MAL ID or AniList ID
    const detailedShow = await getShowMetaById(String(aniListShow.id))
    if (!detailedShow) {
      logger.warn(
        { id: legacyId, showName, aniListId: aniListShow.id },
        'No detailed show meta found for legacy ID migration'
      )
      return legacyId
    }

    const newId = detailedShow._id

    // 5. Save the mapping to DB
    dbRun(db, 'INSERT OR REPLACE INTO legacy_id_mapping (legacyId, numericId) VALUES (?, ?)', [
      legacyId,
      newId,
    ])

    // 6. Perform the DB updates across all tables
    await performWriteTransaction(db, (tx) => {
      // Update watchlist
      const legacyWatchlist = WatchlistRepository.getById(tx, legacyId)
      if (legacyWatchlist) {
        const newWatchlistExists = WatchlistRepository.getById(tx, newId)
        if (newWatchlistExists) {
          WatchlistRepository.delete(tx, legacyId)
        } else {
          tx.run('UPDATE watchlist SET id = ? WHERE id = ?', [newId, legacyId])
        }
      }

      // Update shows_meta
      const legacyShowsMeta = ShowsMetaRepository.getById(tx, legacyId)
      if (legacyShowsMeta) {
        const newShowsMetaExists = ShowsMetaRepository.getById(tx, newId)
        if (newShowsMetaExists) {
          tx.run('DELETE FROM shows_meta WHERE id = ?', [legacyId])
        } else {
          tx.run('UPDATE shows_meta SET id = ? WHERE id = ?', [newId, legacyId])
        }
      }

      // Update other tables
      tx.run('UPDATE OR IGNORE watched_episodes SET showId = ? WHERE showId = ?', [newId, legacyId])
      tx.run('DELETE FROM watched_episodes WHERE showId = ?', [legacyId])

      tx.run('UPDATE OR IGNORE queue SET showId = ? WHERE showId = ?', [newId, legacyId])
      tx.run('DELETE FROM queue WHERE showId = ?', [legacyId])

      tx.run('UPDATE OR IGNORE dismissed_notifications SET showId = ? WHERE showId = ?', [
        newId,
        legacyId,
      ])
      tx.run('DELETE FROM dismissed_notifications WHERE showId = ?', [legacyId])

      tx.run('UPDATE OR IGNORE discovered_notifications SET showId = ? WHERE showId = ?', [
        newId,
        legacyId,
      ])
      tx.run('DELETE FROM discovered_notifications WHERE showId = ?', [legacyId])
    })

    db.scheduleSave()
    logger.info({ legacyId, newId, showName }, 'Successfully migrated legacy show ID to numeric ID')
    return newId
  } catch (err) {
    logger.error({ err, legacyId }, 'Error migrating legacy show ID')
    return legacyId
  }
}
