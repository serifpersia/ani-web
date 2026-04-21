import { Request, Response } from 'express'
import { performWriteTransaction } from '../sync'
import { AllAnimeProvider } from '../providers/allanime.provider'
import { parseString } from 'xml2js'
import logger from '../logger'
import path from 'path'
import fs from 'fs'
import { CONFIG } from '../config'
import { DatabaseWrapper } from '../db'

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

  getSettings = (req: Request, res: Response) => {
    req.db.get(
      'SELECT value FROM settings WHERE key = ?',
      [req.query.key],
      (err: Error | null, row: { value: string }) => res.json({ value: row ? row.value : null })
    )
  }

  updateSettings = async (req: Request, res: Response) => {
    try {
      await performWriteTransaction(req.db, (tx) => {
        tx.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
          req.body.key,
          String(req.body.value),
        ])
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
    initializeDatabase: (path: string) => Promise<DatabaseWrapper>
  ) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })

    const dbName = CONFIG.IS_DEV ? CONFIG.DB_NAME_DEV : CONFIG.DB_NAME_PROD
    const tempPath = path.join(CONFIG.ROOT, `restore_temp.db`)
    const dbPath = path.join(CONFIG.ROOT, dbName)

    db.close((closeErr: Error | null) => {
      if (closeErr) return res.status(500).json({ error: 'Failed to close database.' })

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
            req.db = reopenedDb
          } catch (e) {
            logger.error({ err: e }, 'Failed to reopen DB after rename failure')
          }
          return res.status(500).json({ error: 'Failed to replace database file.' })
        }
        try {
          const newDb = await initializeDatabase(dbPath)
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

    parseString(req.file.buffer.toString(), async (err, result) => {
      if (err) return res.status(400).json({ error: 'Invalid XML' })
      const animeList: MalAnimeItem[] = result?.myanimelist?.anime || []

      let skippedCount = 0
      const showsToInsert: ShowToInsert[] = []

      for (const item of animeList) {
        try {
          const searchResults = await this.provider.search({ query: item.series_title[0] })
          if (searchResults.length > 0) {
            showsToInsert.push({
              id: searchResults[0]._id,
              name: searchResults[0].name,
              thumbnail: searchResults[0].thumbnail,
              status: item.my_status[0],
            })
          } else {
            skippedCount++
          }
        } catch {
          skippedCount++
        }
      }

      try {
        await performWriteTransaction(req.db, (tx) => {
          if (erase) tx.run('DELETE FROM watchlist')
          const stmt = tx.prepare(
            'INSERT OR REPLACE INTO watchlist (id, name, thumbnail, status) VALUES (?, ?, ?, ?)'
          )
          showsToInsert.forEach((show) => stmt.run(show.id, show.name, show.thumbnail, show.status))
          stmt.finalize()
        })
        res.json({ imported: showsToInsert.length, skipped: skippedCount })
      } catch (dbError) {
        logger.error({ err: dbError }, 'Import DB error')
        res.status(500).json({ error: 'DB error' })
      }
    })
  }
}
