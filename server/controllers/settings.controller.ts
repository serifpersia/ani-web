import { Request, Response } from 'express'
import { performWriteTransaction } from '../sync'
import { AllAnimeProvider } from '../providers/allanime.provider'
import { parseString } from 'xml2js'
import logger from '../logger'
import path from 'path'
import fs from 'fs'
import { CONFIG } from '../config'

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
    req.db.get('SELECT value FROM settings WHERE key = ?', [req.query.key], (err: any, row: any) =>
      res.json({ value: row ? row.value : null })
    )
  }

  updateSettings = async (req: Request, res: Response) => {
    try {
      await performWriteTransaction(req.db, (tx) => {
        tx.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
          req.body.key,
          req.body.value,
        ])
      })
      res.json({ success: true })
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }

  backupDatabase = (_req: Request, res: Response) => {
    const dbName = CONFIG.IS_DEV ? CONFIG.DB_NAME_DEV : CONFIG.DB_NAME_PROD
    const dbPath = path.join(CONFIG.ROOT, dbName)
    const backupPath = path.join(CONFIG.ROOT, 'ani-web-backup.db')

    fs.copyFile(dbPath, backupPath, (err) => {
      if (err) return res.status(500).json({ error: 'Backup failed' })
      res.download(backupPath, 'ani-web-backup.db', () => {
        fs.unlink(backupPath, () => {})
      })
    })
  }

  restoreDatabase = (
    req: Request,
    res: Response,
    db: any,
    initializeDatabase: (path: string) => Promise<any>
  ) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })

    const dbName = CONFIG.IS_DEV ? CONFIG.DB_NAME_DEV : CONFIG.DB_NAME_PROD
    const tempPath = path.join(CONFIG.ROOT, `restore_temp.db`)
    const dbPath = path.join(CONFIG.ROOT, dbName)

    db.close((err: any) => {
      if (err) return res.status(500).json({ error: 'Failed to close database.' })
      fs.rename(tempPath, dbPath, (err) => {
        initializeDatabase(dbPath).then((newDb) => (db = newDb))
        if (err) return res.status(500).json({ error: 'Failed to replace database file.' })
        res.json({ success: true, message: 'Database restored.' })
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
