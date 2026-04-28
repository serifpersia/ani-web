import { Request, Response } from 'express'
import { performWriteTransaction } from '../sync'
import { AllAnimeProvider } from '../providers/allanime.provider'
import { parseStringPromise } from 'xml2js'
import logger from '../logger'
import path from 'path'
import fs from 'fs'
import { CONFIG } from '../config'
import { DatabaseWrapper } from '../db'
import { SettingsRepository } from '../repositories/settings.repository'

interface MalAnimeItem {
  series_title: string[]
  my_status: string[]
}

interface ShowToInsert {
  id: string
  name: string
  thumbnail?: string
  status: string
}

export class SettingsController {
  constructor(private provider: AllAnimeProvider) {}

  getSettings = async (req: Request, res: Response) => {
    try {
      const row = await SettingsRepository.getByKey(req.db, req.query.key as string)
      res.json({ value: row ? row.value : null })
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }

  updateSettings = async (req: Request, res: Response) => {
    try {
      await performWriteTransaction(req.db, (tx) => {
        SettingsRepository.upsert(tx, req.body.key, String(req.body.value))
      })
      res.json({ success: true })
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }

  backupDatabase = (req: Request, res: Response) => {
    const backupPath = path.join(CONFIG.ROOT, 'ani-web-backup.db')

    try {
      req.db.backup(backupPath)
      res.download(backupPath, 'ani-web-backup.db', () => {
        fs.unlink(backupPath, () => {})
      })
    } catch (err) {
      logger.error({ err }, 'Manual backup failed')
      return res.status(500).json({ error: 'Backup failed' })
    }
  }

  restoreDatabase = (
    req: Request,
    res: Response,
    db: DatabaseWrapper,
    initializeDatabase: (path: string) => Promise<DatabaseWrapper>,
    setDb: (newDb: DatabaseWrapper) => void
  ) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })

    const dbName = CONFIG.IS_DEV ? CONFIG.DB_NAME_DEV : CONFIG.DB_NAME_PROD
    const tempPath = path.join(CONFIG.ROOT, `restore_temp.db`)
    const dbPath = path.join(CONFIG.ROOT, dbName)

    db.close((closeErr: Error | null) => {
      if (closeErr) return res.status(500).json({ error: 'Failed to close database.' })

      try {
        req.db.checkpoint()
      } catch (checkpointErr) {
        logger.warn({ err: checkpointErr }, 'WAL checkpoint failed')
      }

      try {
        if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`)
        if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`)
      } catch (cleanupErr) {
        logger.warn({ err: cleanupErr }, 'Failed to clean up WAL files')
      }

      fs.rename(tempPath, dbPath, async (renameErr) => {
        if (renameErr) {
          try {
            const reopenedDb = await initializeDatabase(dbPath)
            setDb(reopenedDb)
            req.db = reopenedDb
          } catch (e) {
            logger.error({ err: e }, 'Failed to reopen DB after rename failure')
          }
          return res.status(500).json({ error: 'Failed to replace database file.' })
        }
        try {
          const newDb = await initializeDatabase(dbPath)
          setDb(newDb)
          req.db = newDb
          res.json({ success: true, message: 'Database restored.' })
        } catch (e) {
          logger.error({ err: e }, 'Failed to initialize restored database')
          res.status(500).json({ error: 'Failed to initialize restored database.' })
        }
      })
    })
  }

  importMalXml = async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'No file' })
    const { erase } = req.body

    let result: Record<string, unknown>
    try {
      result = await parseStringPromise(req.file.buffer.toString())
    } catch {
      return res.status(400).json({ error: 'Invalid XML' })
    }

    const animeList: MalAnimeItem[] =
      ((result?.myanimelist as Record<string, unknown>)?.anime as MalAnimeItem[]) || []

    let skippedCount = 0
    const showsToInsert: ShowToInsert[] = []

    const BATCH_SIZE = 5
    for (let i = 0; i < animeList.length; i += BATCH_SIZE) {
      const batch = animeList.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.allSettled(
        batch.map((item) => this.provider.search({ query: item.series_title[0] }))
      )
      batchResults.forEach((r, idx) => {
        if (r.status === 'fulfilled' && r.value.length > 0) {
          showsToInsert.push({
            id: r.value[0]._id,
            name: r.value[0].name,
            thumbnail: r.value[0].thumbnail,
            status: batch[idx].my_status[0],
          })
        } else {
          skippedCount++
        }
      })
    }

    try {
      await performWriteTransaction(req.db, (tx) => {
        if (erase) SettingsRepository.clearWatchlist(tx)
        SettingsRepository.upsertWatchlistBatch(tx, showsToInsert)
      })
      res.json({ imported: showsToInsert.length, skipped: skippedCount })
    } catch (dbError) {
      logger.error({ err: dbError }, 'Import DB error')
      res.status(500).json({ error: 'DB error' })
    }
  }
}
