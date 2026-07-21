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
import { getMachineId } from '../utils/machine-id'
import { discordRPCService } from '../discord-rpc'

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
      let value = row ? row.value : null
      if (value === null && req.query.key === 'discordRPCEnabled') {
        value = 'true'
      }
      res.json({ value: value })
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }

  updateSettings = async (req: Request, res: Response) => {
    try {
      await performWriteTransaction(req.db, (tx) => {
        SettingsRepository.upsert(tx, req.body.key, String(req.body.value))
      })
      if (req.body.key === 'discordRPCEnabled') {
        discordRPCService.setEnabled(req.body.value === 'true' || req.body.value === true)
      }
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

    await performWriteTransaction(req.db, (tx) => {
      if (erase) SettingsRepository.clearWatchlist(tx)
      SettingsRepository.upsertWatchlistBatch(tx, showsToInsert)
    })
    res.json({ imported: showsToInsert.length, skipped: skippedCount })
  }

  getInstallationId = (_req: Request, res: Response) => {
    try {
      res.json({ id: getMachineId() })
    } catch (err) {
      logger.error({ err }, 'Failed to get machine ID')
      res.status(500).json({ error: 'Failed to get machine ID' })
    }
  }

  recoverAllanime = async (_req: Request, res: Response) => {
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'

    try {
      // 1. Fetch mkissa.to to find entry JS
      const htmlRes = await fetch('https://mkissa.to', { headers: { 'User-Agent': UA } })
      const html = await htmlRes.text()
      const entryMatch = html.match(/import\("([^"]+entry[/\\]app\.[^"]+\.js)"\)/i)
      if (!entryMatch) throw new Error('Could not find entry JS URL')

      const entryUrl = entryMatch[1].startsWith('http')
        ? entryMatch[1]
        : `https://mkissa.to${entryMatch[1]}`

      // 2. Download entry JS to list chunks
      const entryRes = await fetch(entryUrl, { headers: { 'User-Agent': UA } })
      const entryCode = await entryRes.text()
      const chunkNames = [
        ...new Set([...entryCode.matchAll(/\.\.\/chunks\/([^"']+\.js)/g)].map((m) => m[1])),
      ]
      if (chunkNames.length === 0) throw new Error('No chunks found in entry JS')

      const CDN = 'https://cdn.mkissa.net/all/mk/_app/immutable'
      const buildIdRe = /\w+=\w+\(\d+\)!==["']string["']\?["'](\d+)["']/

      // 3. Search each chunk for the build ID pattern (first 200KB)
      let cryptoUrl = ''
      for (const name of chunkNames) {
        const url = `${CDN}/chunks/${name}`
        try {
          const rangeRes = await fetch(url, {
            headers: { 'User-Agent': UA, Range: 'bytes=0-200000' },
          })
          if (rangeRes.ok) {
            const text = await rangeRes.text()
            if (buildIdRe.test(text)) {
              cryptoUrl = url
              break
            }
          }
        } catch {
          /* try next */
        }
      }
      if (!cryptoUrl) throw new Error('Could not find crypto chunk')

      // 4. Download full crypto chunk
      const cryptoRes = await fetch(cryptoUrl, { headers: { 'User-Agent': UA } })
      const cryptoCode = await cryptoRes.text()

      const maskMatch = cryptoCode.match(/\b([a-f0-9]{64})\b/)
      const buildIdMatch = cryptoCode.match(buildIdRe)
      if (!maskMatch || !buildIdMatch) throw new Error('Could not extract crypto constants')

      const maskHex = maskMatch[1]
      const buildId = buildIdMatch[1]

      // 5. Verify bootstrap accepts new build ID
      const bootRes = await fetch(
        `https://api.mkissa.net/client-crypto/v1/bootstrap?buildId=${buildId}`,
        { headers: { 'User-Agent': UA, Referer: 'https://youtu-chan.com' } }
      )
      const bootData = await bootRes.json()
      if (!bootData?.partB) throw new Error(`Bootstrap rejected build ID ${buildId}`)

      // 6. Patch env vars in-memory and rebootstrap
      process.env.AA_BUILD_ID = buildId
      process.env.AA_MASK_HEX = maskHex
      await this.provider.refreshKey()

      // 7. Persist to .env files for next restart
      const envLine = (key: string, val: string) => `${key}=${val}`
      const upsertEnv = (filePath: string) => {
        let content = ''
        try {
          content = fs.readFileSync(filePath, 'utf-8')
        } catch {
          /* ok */
        }
        const lines = content
          .split('\n')
          .filter((l) => l && !l.startsWith('AA_BUILD_ID=') && !l.startsWith('AA_MASK_HEX='))
        lines.push(envLine('AA_BUILD_ID', buildId), envLine('AA_MASK_HEX', maskHex))
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8')
      }
      upsertEnv(path.join(CONFIG.SERVER_ROOT, '.env'))
      upsertEnv(CONFIG.ENV_PATH)

      logger.info({ buildId, maskHex: maskHex.slice(0, 16) + '…' }, 'AllAnime crypto recovered')
      res.json({ success: true, buildId, maskHex })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error({ err }, 'AllAnime recovery failed')
      res.status(500).json({ success: false, error: message })
    }
  }
}
