import * as fs from 'fs/promises'
import path from 'path'
import type { Database } from 'sqlite3'
import sqlite3 from 'sqlite3'
import logger from './logger'
import { googleDriveService } from './google'
import { rcloneService } from './rclone'
import { CONFIG } from './config'

const log = logger.child({ module: 'Sync' })

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

async function getRemoteVersion(
  remoteFolder: string
): Promise<{ version: number; fileId?: string }> {
  try {
    if (activeProvider === 'google') {
      const folderId = await googleDriveService.ensureFolder(remoteFolder)
      const file = await googleDriveService.findFile(CONFIG.MANIFEST_FILENAME, folderId)
      if (!file) return { version: 0 }

      await googleDriveService.downloadFile(file.id, CONFIG.TEMP_MANIFEST_PATH)
      const content = await fs.readFile(CONFIG.TEMP_MANIFEST_PATH, 'utf-8')
      await fs.unlink(CONFIG.TEMP_MANIFEST_PATH)
      return { version: JSON.parse(content).version || 0, fileId: file.id }
    }

    if (activeProvider === 'rclone') {
      const exists = await rcloneService.fileExists(remoteFolder, CONFIG.MANIFEST_FILENAME)
      if (!exists) return { version: 0 }

      await rcloneService.downloadFile(
        remoteFolder,
        CONFIG.MANIFEST_FILENAME,
        CONFIG.TEMP_MANIFEST_PATH
      )
      const content = await fs.readFile(CONFIG.TEMP_MANIFEST_PATH, 'utf-8')
      await fs.unlink(CONFIG.TEMP_MANIFEST_PATH)
      return { version: JSON.parse(content).version || 0 }
    }
  } catch (err) {
    log.warn({ err }, 'Could not read remote manifest.')
  }
  return { version: 0 }
}

async function getLocalVersion(db: Database): Promise<number> {
  return new Promise((resolve) => {
    db.get(
      'SELECT value FROM sync_metadata WHERE key = ?',
      ['db_version'],
      (err, row: { value: number }) => {
        resolve(row ? row.value : 0)
      }
    )
  })
}

async function isLocalDbEmpty(db: Database): Promise<boolean> {
  return new Promise((resolve) => {
    db.get('SELECT COUNT(*) as count FROM watchlist', (err, row: { count: number }) => {
      if (err) resolve(true)
      else resolve(row.count === 0)
    })
  })
}

async function getSyncMetadata(db: Database): Promise<{ localVersion: number; isDirty: boolean }> {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT key, value FROM sync_metadata',
      (err: Error | null, rows: { key: string; value: number }[]) => {
        if (err) return reject(err)
        const metadata = rows.reduce(
          (acc, row) => {
            acc[row.key] = row.value
            return acc
          },
          {} as Record<string, number>
        )
        resolve({
          localVersion: metadata.db_version || 0,
          isDirty: !!metadata.is_dirty,
        })
      }
    )
  })
}

export async function syncDownOnBoot(
  db: Database,
  dbPath: string,
  remoteFolderName: string,
  closeMainDb: () => Promise<void>
): Promise<boolean> {
  if (activeProvider === 'none') return false
  if (isSyncing) return false
  isSyncing = true

  try {
    log.info(`--> Initial sync check (${activeProvider})...`)

    const localVersion = await getLocalVersion(db)
    const isEmpty = await isLocalDbEmpty(db)
    const { version: remoteVersion } = await getRemoteVersion(remoteFolderName)

    log.info(`Sync Check: Local v${localVersion} (Empty: ${isEmpty}) vs Remote v${remoteVersion}`)

    if (remoteVersion > localVersion || (isEmpty && remoteVersion > 0)) {
      log.info(`Downloading remote database (Remote v${remoteVersion})...`)

      await closeMainDb()
      const backupPath = `${dbPath}.bak`
      const dbName = path.basename(dbPath)

      try {
        await fs.copyFile(dbPath, backupPath)

        if (activeProvider === 'google') {
          const folderId = await googleDriveService.ensureFolder(remoteFolderName)
          const remoteFile = await googleDriveService.findFile(dbName, folderId)
          if (remoteFile) await googleDriveService.downloadFile(remoteFile.id, dbPath)
          else throw new Error('Manifest exists but DB file missing.')
        } else if (activeProvider === 'rclone') {
          await rcloneService.downloadFile(remoteFolderName, dbName, dbPath)
        }

        await fs.unlink(backupPath)
        log.info('Sync down complete.')
        return true
      } catch (err) {
        log.error({ err }, 'Sync down failed. Restoring backup.')
        try {
          await fs.copyFile(backupPath, dbPath)
        } catch {}
        return true
      }
    } else {
      log.info('Local DB is up to date.')
      return false
    }
  } catch (err) {
    log.error({ err }, 'Sync boot error.')
    return false
  } finally {
    isSyncing = false
  }
}

export async function syncUp(
  db: Database,
  dbPath: string,
  remoteFolderName: string
): Promise<void> {
  if (activeProvider === 'none') return
  if (isSyncing) return

  isSyncing = true
  try {
    const { localVersion, isDirty } = await getSyncMetadata(db)
    if (!isDirty) return

    log.info(`--> Syncing up (Local v${localVersion})...`)

    const { version: remoteVersion, fileId: manifestId } = await getRemoteVersion(remoteFolderName)
    if (remoteVersion > localVersion) {
      log.error(`CONFLICT: Remote v${remoteVersion} > Local v${localVersion}. Aborting upload.`)
      return
    }

    const dbName = path.basename(dbPath)
    const newManifest = JSON.stringify({ version: localVersion })
    await fs.writeFile(CONFIG.TEMP_MANIFEST_PATH, newManifest)

    if (activeProvider === 'google') {
      const folderId = await googleDriveService.ensureFolder(remoteFolderName)
      const remoteDbFile = await googleDriveService.findFile(dbName, folderId)

      await googleDriveService.uploadFile(
        dbPath,
        dbName,
        'application/x-sqlite3',
        folderId,
        remoteDbFile?.id
      )
      await googleDriveService.uploadFile(
        CONFIG.TEMP_MANIFEST_PATH,
        CONFIG.MANIFEST_FILENAME,
        'application/json',
        folderId,
        manifestId
      )
    } else if (activeProvider === 'rclone') {
      await rcloneService.uploadFile(dbPath, remoteFolderName, dbName)
      await rcloneService.uploadFile(
        CONFIG.TEMP_MANIFEST_PATH,
        remoteFolderName,
        CONFIG.MANIFEST_FILENAME
      )
    }

    await fs.unlink(CONFIG.TEMP_MANIFEST_PATH)

    await new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        db.run('UPDATE sync_metadata SET value = 0 WHERE key = "is_dirty"')
        db.run(
          'UPDATE sync_metadata SET value = ? WHERE key = "last_synced_version"',
          [localVersion],
          (err: Error | null) => {
            if (err) reject(err)
            else resolve()
          }
        )
      })
    })

    log.info('<-- Sync up complete.')
  } catch (err) {
    log.error({ err }, 'Sync up failed.')
  } finally {
    isSyncing = false
  }
}

export async function performWriteTransaction(
  db: Database,
  runnable: (tx: Database) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION')
      try {
        runnable(db)
        db.run('UPDATE sync_metadata SET value = value + 1 WHERE key = "db_version"')
        db.run('UPDATE sync_metadata SET value = 1 WHERE key = "is_dirty"')
        db.run('COMMIT', (err: Error | null) => {
          if (err) {
            db.run('ROLLBACK')
            reject(err)
          } else {
            resolve()
          }
        })
      } catch (e) {
        db.run('ROLLBACK')
        reject(e)
      }
    })
  })
}

export function initializeDatabase(dbPath: string): Promise<Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err: Error | null) => {
      if (err) {
        log.error({ err }, 'Database opening error')
        return reject(err)
      }
    })
    db.configure('busyTimeout', 5000)
    db.serialize(() => {
      db.run(
        `CREATE TABLE IF NOT EXISTS watchlist (id TEXT NOT NULL, name TEXT, thumbnail TEXT, status TEXT, nativeName TEXT, englishName TEXT, PRIMARY KEY (id))`
      )
      db.run(
        `CREATE TABLE IF NOT EXISTS watched_episodes (showId TEXT NOT NULL, episodeNumber TEXT NOT NULL, watchedAt DATETIME DEFAULT CURRENT_TIMESTAMP, currentTime REAL DEFAULT 0, duration REAL DEFAULT 0, PRIMARY KEY (showId, episodeNumber))`
      )
      db.run(
        `CREATE TABLE IF NOT EXISTS settings (key TEXT NOT NULL, value TEXT, PRIMARY KEY (key))`
      )
      db.run(
        `CREATE TABLE IF NOT EXISTS shows_meta (id TEXT PRIMARY KEY, name TEXT, thumbnail TEXT, nativeName TEXT, englishName TEXT, episodeCount INTEGER, genres TEXT, popularityScore INTEGER)`
      )
      db.run(`CREATE TABLE IF NOT EXISTS sync_metadata (key TEXT PRIMARY KEY, value INTEGER)`)
      db.run(`INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('db_version', 1)`)
      db.run(`INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('last_synced_version', 0)`)
      db.run(`INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('is_dirty', 0)`)
      db.run(`CREATE INDEX IF NOT EXISTS idx_watched_episodes_showId ON watched_episodes(showId)`)
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_watched_episodes_watchedAt ON watched_episodes(watchedAt)`
      )
      db.run(`CREATE INDEX IF NOT EXISTS idx_watchlist_status ON watchlist(status)`)

      const addCol = (tbl: string, col: string, type: string) => {
        db.all(`PRAGMA table_info(${tbl})`, (e: Error | null, r: any[]) => {
          if (!r.some((c) => c.name === col)) db.run(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${type}`)
        })
      }
      addCol('watchlist', 'nativeName', 'TEXT')
      addCol('watchlist', 'englishName', 'TEXT')
      addCol('shows_meta', 'nativeName', 'TEXT')
      addCol('shows_meta', 'englishName', 'TEXT')
      addCol('shows_meta', 'episodeCount', 'INTEGER')
      addCol('shows_meta', 'genres', 'TEXT')
      addCol('shows_meta', 'popularityScore', 'INTEGER')

      resolve(db)
    })
  })
}
