import * as fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import logger from './logger'
import { googleDriveService } from './google'
import { rcloneService } from './rclone'
import { CONFIG } from './config'
import { DatabaseWrapper } from './db'

const log = logger.child({ module: 'Sync' })

class Mutex {
  private _locked = false
  private _waiting: (() => void)[] = []

  async lock() {
    return new Promise<void>((resolve) => {
      if (!this._locked) {
        this._locked = true
        resolve()
      } else {
        this._waiting.push(resolve)
      }
    })
  }

  unlock() {
    if (this._waiting.length > 0) {
      const resolve = this._waiting.shift()!
      resolve()
    } else {
      this._locked = false
    }
  }
}

const syncMutex = new Mutex()
let isSyncing = false
let activeProvider: 'google' | 'rclone' | 'none' = 'none'

export async function initSyncProvider(): Promise<void> {
  if (googleDriveService.isAuthenticated()) {
    activeProvider = 'google'
    log.info('Sync Provider: Google Drive API')
    return
  }

  const rcloneAvailable = await rcloneService.init()
  if (rcloneAvailable) {
    activeProvider = 'rclone'
    log.info(`Sync Provider: Rclone (${rcloneService.getRemoteName()})`)
    return
  }

  activeProvider = 'none'
  log.info('No sync provider available.')
}

export async function getLocalManifestVersion(): Promise<number> {
  if (existsSync(CONFIG.LOCAL_MANIFEST_PATH)) {
    try {
      const content = await fs.readFile(CONFIG.LOCAL_MANIFEST_PATH, 'utf-8')
      return JSON.parse(content).version || 0
    } catch {
      return 0
    }
  }
  return 0
}

export async function setLocalManifestVersion(version: number): Promise<void> {
  await fs.writeFile(CONFIG.LOCAL_MANIFEST_PATH, JSON.stringify({ version }))
}

async function getRemoteManifestVersion(
  remoteFolder: string
): Promise<{ version: number; fileId?: string }> {
  try {
    if (activeProvider === 'google') {
      const folderId = await googleDriveService.ensureFolder(remoteFolder)
      const file = await googleDriveService.findFile(CONFIG.MANIFEST_FILENAME, folderId)
      if (!file) return { version: 0 }

      const tempPath = path.join(CONFIG.ROOT, `temp_${Date.now()}_manifest.json`)
      try {
        await googleDriveService.downloadFile(file.id, tempPath)
        const content = await fs.readFile(tempPath, 'utf-8')
        return { version: JSON.parse(content).version || 0, fileId: file.id }
      } finally {
        if (existsSync(tempPath)) await fs.unlink(tempPath)
      }
    } else if (activeProvider === 'rclone') {
      const exists = await rcloneService.fileExists(remoteFolder, CONFIG.MANIFEST_FILENAME)
      if (!exists) return { version: 0 }

      const tempPath = path.join(CONFIG.ROOT, `temp_${Date.now()}_manifest.json`)
      try {
        await rcloneService.downloadFile(remoteFolder, CONFIG.MANIFEST_FILENAME, tempPath)
        const content = await fs.readFile(tempPath, 'utf-8')
        return { version: JSON.parse(content).version || 0 }
      } finally {
        if (existsSync(tempPath)) await fs.unlink(tempPath)
      }
    }
  } catch (err) {
    log.warn({ err }, 'Could not read remote manifest.')
  }
  return { version: 0 }
}

export async function syncDownOnBoot(
  db: DatabaseWrapper,
  dbPath: string,
  remoteFolderName: string,
  closeMainDb: () => Promise<void>
): Promise<boolean> {
  let localVersion = await getLocalManifestVersion()

  if (localVersion === 0 && db) {
    localVersion = await new Promise<number>((resolve) => {
      db.get(
        "SELECT value FROM sync_metadata WHERE key = 'db_version'",
        undefined,
        (_err: Error | null, row: { value: number } | undefined) => {
          resolve(row ? row.value : 0)
        }
      )
    })
    if (localVersion > 0) {
      await setLocalManifestVersion(localVersion)
    }
  }

  if (activeProvider === 'none') return false

  await syncMutex.lock()
  if (isSyncing) {
    syncMutex.unlock()
    return false
  }
  isSyncing = true

  try {
    console.log(`[SYNC_START] Initial sync check (${activeProvider})`)
    const { version: remoteVersion } = await getRemoteManifestVersion(remoteFolderName)
    console.log('[SYNC_END]')

    log.info(`Sync Check: Local v${localVersion} vs Remote v${remoteVersion}`)

    if (remoteVersion > localVersion) {
      console.log(`[SYNC_START] Downloading remote database (Remote v${remoteVersion})`)
      await closeMainDb()

      const backupPath = `${dbPath}.bak`
      const dbName = path.basename(dbPath)

      try {
        if (existsSync(dbPath)) {
          await fs.copyFile(dbPath, backupPath)
        }

        try {
          await fs.unlink(`${dbPath}-wal`)
        } catch (e) {
          void e
        }
        try {
          await fs.unlink(`${dbPath}-shm`)
        } catch (e) {
          void e
        }

        if (activeProvider === 'google') {
          const folderId = await googleDriveService.ensureFolder(remoteFolderName)
          const remoteDb = await googleDriveService.findFile(dbName, folderId)
          const remoteManifest = await googleDriveService.findFile(
            CONFIG.MANIFEST_FILENAME,
            folderId
          )

          if (remoteDb) await googleDriveService.downloadFile(remoteDb.id, dbPath)
          if (remoteManifest)
            await googleDriveService.downloadFile(remoteManifest.id, CONFIG.LOCAL_MANIFEST_PATH)
        } else if (activeProvider === 'rclone') {
          await rcloneService.downloadFile(remoteFolderName, dbName, dbPath)
          await rcloneService.downloadFile(
            remoteFolderName,
            CONFIG.MANIFEST_FILENAME,
            CONFIG.LOCAL_MANIFEST_PATH
          )
        }

        if (existsSync(backupPath)) {
          await fs.unlink(backupPath)
        }

        console.log('[SYNC_END]')
        log.info('Sync down complete.')
        return true
      } catch (err) {
        console.log('[SYNC_END]')
        log.error({ err }, 'Sync down failed. Restoring backup.')
        if (existsSync(backupPath)) {
          try {
            await fs.copyFile(backupPath, dbPath)
            log.info('Backup restored successfully after failed sync down.')
          } catch (restoreErr) {
            log.error({ err: restoreErr }, 'Critical: restore from backup also failed.')
            // The DB may be corrupt – propagate so the caller can exit cleanly.
            throw new Error('Sync down and restore both failed. Database may be corrupt.', {
              cause: restoreErr,
            })
          }
        }
        // DB was already closed before the attempt; re-open is required regardless.
        return true
      }
    } else {
      log.info('Local DB is up to date.')
      return false
    }
  } catch (err) {
    console.log('[SYNC_END]')
    log.error({ err }, 'Sync boot error.')
    return false
  } finally {
    isSyncing = false
    syncMutex.unlock()
  }
}

export async function syncUp(
  db: DatabaseWrapper,
  dbPath: string,
  remoteFolderName: string
): Promise<void> {
  if (activeProvider === 'none') return

  await syncMutex.lock()
  if (isSyncing) {
    syncMutex.unlock()
    return
  }
  isSyncing = true

  try {
    const localVersion = await getLocalManifestVersion()
    console.log(`[SYNC_START] Syncing up (Local v${localVersion})`)

    const { version: remoteVersion, fileId: manifestId } =
      await getRemoteManifestVersion(remoteFolderName)

    if (localVersion > remoteVersion) {
      const dbName = path.basename(dbPath)
      const syncDbPath = `${dbPath}.sync.db`
      // VACUUM INTO creates a fully consistent snapshot that already incorporates
      // any pending WAL frames — an explicit checkpoint before backup is not needed
      // and introduced a race window where a concurrent write could produce an
      // inconsistent snapshot.
      db.backup(syncDbPath)

      if (activeProvider === 'google') {
        const folderId = await googleDriveService.ensureFolder(remoteFolderName)
        const remoteDbFile = await googleDriveService.findFile(dbName, folderId)

        await googleDriveService.uploadFile(
          syncDbPath,
          dbName,
          'application/x-sqlite3',
          folderId,
          remoteDbFile?.id
        )

        await googleDriveService.uploadFile(
          CONFIG.LOCAL_MANIFEST_PATH,
          CONFIG.MANIFEST_FILENAME,
          'application/json',
          folderId,
          manifestId
        )
      } else if (activeProvider === 'rclone') {
        await rcloneService.uploadFile(syncDbPath, remoteFolderName, dbName)
        await rcloneService.uploadFile(
          CONFIG.LOCAL_MANIFEST_PATH,
          remoteFolderName,
          CONFIG.MANIFEST_FILENAME
        )
      }

      if (existsSync(syncDbPath)) await fs.unlink(syncDbPath)

      console.log('[SYNC_END]')
      log.info('Sync up complete.')
    } else {
      console.log('[SYNC_END]')
      log.info('No changes to sync up or remote is newer.')
    }
  } catch (err) {
    console.log('[SYNC_END]')
    log.error({ err }, 'Sync up failed.')
  } finally {
    isSyncing = false
    syncMutex.unlock()
  }
}

export async function performWriteTransaction(
  db: DatabaseWrapper,
  runnable: (tx: DatabaseWrapper) => void
): Promise<void> {
  // node:sqlite is fully synchronous — serialize/run/get all complete before returning,
  // so we can avoid the nested Promise/callback pattern that could hang forever if
  // setLocalManifestVersion threw after resolve/reject was no longer reachable.
  db.serialize(() => {
    runnable(db)
    db.run("UPDATE sync_metadata SET value = value + 1 WHERE key = 'db_version'")
  })

  // Capture version synchronously; the callback fires immediately with node:sqlite.
  let newVersion = 1
  let capturedErr: Error | null = null
  db.get(
    "SELECT value FROM sync_metadata WHERE key = 'db_version'",
    undefined,
    (err: Error | null, row: { value: number } | undefined) => {
      capturedErr = err
      if (!err) newVersion = row?.value ?? 1
    }
  )
  if (capturedErr) throw capturedErr

  // Only the manifest write is truly async (disk I\O); errors here propagate normally.
  await setLocalManifestVersion(newVersion)
}

export async function initializeDatabase(dbPath: string): Promise<DatabaseWrapper> {
  try {
    const db = await DatabaseWrapper.create(dbPath)
    db.configure('busyTimeout', 5000)

    db.run('PRAGMA journal_mode = WAL;')
    db.run('PRAGMA synchronous = NORMAL;')

    db.run('PRAGMA cache_size = -20000;')
    db.run('PRAGMA temp_store = MEMORY;')
    db.run('PRAGMA mmap_size = 268435456;')
    db.run('PRAGMA foreign_keys = ON;')

    const initOpts = { skipSave: true } as const

    db.run(
      `CREATE TABLE IF NOT EXISTS watchlist (id TEXT NOT NULL, name TEXT, thumbnail TEXT, status TEXT, nativeName TEXT, englishName TEXT, type TEXT, PRIMARY KEY (id))`,
      undefined,
      undefined,
      initOpts
    )
    db.run(
      `CREATE TABLE IF NOT EXISTS watched_episodes (showId TEXT NOT NULL, episodeNumber TEXT NOT NULL, watchedAt DATETIME DEFAULT CURRENT_TIMESTAMP, currentTime REAL DEFAULT 0, duration REAL DEFAULT 0, PRIMARY KEY (showId, episodeNumber))`,
      undefined,
      undefined,
      initOpts
    )
    db.run(
      `CREATE TABLE IF NOT EXISTS settings (key TEXT NOT NULL, value TEXT, PRIMARY KEY (key))`,
      undefined,
      undefined,
      initOpts
    )
    db.run(
      `CREATE TABLE IF NOT EXISTS shows_meta (id TEXT PRIMARY KEY, name TEXT, thumbnail TEXT, nativeName TEXT, englishName TEXT, episodeCount INTEGER, status TEXT, genres TEXT, popularityScore INTEGER, type TEXT)`,
      undefined,
      undefined,
      initOpts
    )
    db.run(
      `CREATE TABLE IF NOT EXISTS dismissed_notifications (showId TEXT NOT NULL, episodeNumber TEXT NOT NULL, dismissedAt DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (showId, episodeNumber))`,
      undefined,
      undefined,
      initOpts
    )
    db.run(
      `CREATE TABLE IF NOT EXISTS discovered_notifications (showId TEXT NOT NULL, episodeNumber TEXT NOT NULL, discoveredAt DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (showId, episodeNumber))`,
      undefined,
      undefined,
      initOpts
    )
    db.run(
      `CREATE TABLE IF NOT EXISTS sync_metadata (key TEXT PRIMARY KEY, value INTEGER)`,
      undefined,
      undefined,
      initOpts
    )
    db.run(
      `INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('db_version', 1)`,
      undefined,
      undefined,
      initOpts
    )

    db.run(
      `CREATE INDEX IF NOT EXISTS idx_watched_episodes_showId ON watched_episodes(showId)`,
      undefined,
      undefined,
      initOpts
    )
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_watched_episodes_showId_episodeNumber ON watched_episodes(showId, episodeNumber)`,
      undefined,
      undefined,
      initOpts
    )
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_watched_episodes_watchedAt ON watched_episodes(watchedAt)`,
      undefined,
      undefined,
      initOpts
    )
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_watchlist_status ON watchlist(status)`,
      undefined,
      undefined,
      initOpts
    )

    const addCol = (tbl: string, col: string, type: string) => {
      db.all(`PRAGMA table_info(${tbl})`, (e: Error | null, r: unknown) => {
        const columns = r as { name: string }[]
        if (!columns.some((c) => c.name === col))
          db.run(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${type}`, undefined, undefined, initOpts)
      })
    }

    addCol('watchlist', 'nativeName', 'TEXT')
    addCol('watchlist', 'englishName', 'TEXT')
    addCol('shows_meta', 'nativeName', 'TEXT')
    addCol('shows_meta', 'englishName', 'TEXT')
    addCol('shows_meta', 'episodeCount', 'INTEGER')
    addCol('shows_meta', 'status', 'TEXT')
    addCol('shows_meta', 'genres', 'TEXT')
    addCol('shows_meta', 'popularityScore', 'INTEGER')
    addCol('watchlist', 'type', 'TEXT')
    addCol('shows_meta', 'type', 'TEXT')

    await db.saveNow()
    return db
  } catch (err) {
    log.error({ err }, 'Database opening error')
    throw err
  }
}
