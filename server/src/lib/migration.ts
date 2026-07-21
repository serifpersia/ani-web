import { DatabaseWrapper } from '../db'
import { performWriteTransaction } from '../sync'
import { searchAnilistByTitle } from './anilist'
import { WatchlistRepository } from '../repositories/watchlist.repository'
import { ShowsMetaRepository } from '../repositories/shows-meta.repository'
import { dbGet, dbRun } from '../utils/db-utils'
import logger from '../logger'
import { Provider } from '../providers/provider.interface'

const inFlightMigrations = new Map<string, Promise<string>>()

async function migrateId(
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
      const mappedMeta = (await ShowsMetaRepository.getById(db, mapping.numericId)) as {
        anilistId?: number
      } | null
      const canonicalId = mappedMeta?.anilistId ? String(mappedMeta.anilistId) : undefined
      if (!canonicalId || canonicalId === mapping.numericId) {
        return mapping.numericId
      }

      await performWriteTransaction(db, (tx) => {
        tx.run('UPDATE OR IGNORE watchlist SET id = ? WHERE id = ?', [
          canonicalId,
          mapping.numericId,
        ])
        tx.run('DELETE FROM watchlist WHERE id = ?', [mapping.numericId])
        tx.run('UPDATE OR IGNORE shows_meta SET id = ? WHERE id = ?', [
          canonicalId,
          mapping.numericId,
        ])
        tx.run('DELETE FROM shows_meta WHERE id = ?', [mapping.numericId])
        tx.run('UPDATE OR IGNORE watched_episodes SET showId = ? WHERE showId = ?', [
          canonicalId,
          mapping.numericId,
        ])
        tx.run('DELETE FROM watched_episodes WHERE showId = ?', [mapping.numericId])
        tx.run('UPDATE OR IGNORE queue SET showId = ? WHERE showId = ?', [
          canonicalId,
          mapping.numericId,
        ])
        tx.run('DELETE FROM queue WHERE showId = ?', [mapping.numericId])
        tx.run('UPDATE OR IGNORE dismissed_notifications SET showId = ? WHERE showId = ?', [
          canonicalId,
          mapping.numericId,
        ])
        tx.run('DELETE FROM dismissed_notifications WHERE showId = ?', [mapping.numericId])
        tx.run('UPDATE OR IGNORE discovered_notifications SET showId = ? WHERE showId = ?', [
          canonicalId,
          mapping.numericId,
        ])
        tx.run('DELETE FROM discovered_notifications WHERE showId = ?', [mapping.numericId])
        tx.run('UPDATE legacy_id_mapping SET numericId = ? WHERE legacyId = ?', [
          canonicalId,
          legacyId,
        ])
      })
      db.scheduleSave()
      logger.info(
        { legacyId, previousId: mapping.numericId, newId: canonicalId },
        'Canonicalized migrated show ID'
      )
      return canonicalId
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

    const newId = String(aniListShow.id)

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

export function getMigratedId(
  db: DatabaseWrapper,
  legacyId: string,
  providers: { [key: string]: Provider | undefined }
): Promise<string> {
  if (/^\d+$/.test(legacyId)) return Promise.resolve(legacyId)

  const existing = inFlightMigrations.get(legacyId)
  if (existing) return existing

  const migration = migrateId(db, legacyId, providers)
  inFlightMigrations.set(legacyId, migration)
  migration.then(
    () => inFlightMigrations.delete(legacyId),
    () => inFlightMigrations.delete(legacyId)
  )
  return migration
}
