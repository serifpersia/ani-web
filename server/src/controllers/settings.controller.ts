import { Request, Response } from 'express'
import vm from 'node:vm'
import { performWriteTransaction } from '../sync'
import { searchAnilistByTitle } from '../lib/anilist'
import { parseStringPromise } from 'xml2js'
import logger from '../logger'
import path from 'path'
import fs from 'fs'
import { CONFIG } from '../config'
import { DatabaseWrapper } from '../db'
import { SettingsRepository } from '../repositories/settings.repository'
import { getMachineId } from '../utils/machine-id'
import { discordRPCService } from '../discord-rpc'
import { AllAnimeProvider } from '../providers/allanime.provider'

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
  constructor(private allAnimeProvider?: AllAnimeProvider) {}
  getSettings = async (req: Request, res: Response) => {
    try {
      const row = await SettingsRepository.getByKey(req.db, req.query.key as string)
      let value = row ? row.value : null
      if (value === null && req.query.key === 'discordRPCEnabled') {
        value = 'true'
      }
      if (value === null && req.query.key === 'discordRPCHideMature') {
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
      if (req.body.key === 'discordRPCHideMature') {
        discordRPCService.setHideMature(req.body.value === 'true' || req.body.value === true)
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
        batch.map((item) => searchAnilistByTitle(item.series_title[0]))
      )
      batchResults.forEach((r, idx) => {
        if (r.status === 'fulfilled' && r.value) {
          const show = r.value
          const title = show.title?.english || show.title?.romaji || batch[idx].series_title[0]
          showsToInsert.push({
            id: String(show.id),
            name: title,
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

  private static async extractAaCrypto(
    chunkCode: string
  ): Promise<{ buildId: string; maskHex: string }> {
    const start = chunkCode.indexOf('const Sf=Ss;')
    const end = chunkCode.indexOf('function US()')
    if (start < 0 || end < 0) {
      throw new Error('AA crypto code not found in chunk')
    }
    const extracted = `const __self = (function () {
${chunkCode.slice(start, end)}
return { qh, wf };
})();`
    const ctx = vm.createContext({
      console: { log: () => {} },
      TextEncoder,
      Uint8Array,
      ArrayBuffer,
      btoa,
      atob,
      crypto: globalThis.crypto,
    })
    vm.runInContext(extracted, ctx)
    const self = vm.runInContext('__self', ctx) as {
      qh: (e?: string) => Uint8Array | null
      wf: string
    }
    const mask = self.qh(self.wf || '76')
    if (!mask || mask.length !== 32) {
      throw new Error('AA mask derivation returned invalid result')
    }
    const maskHex = Array.from(mask)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    return { buildId: String(self.wf || ''), maskHex }
  }

  recoverAllanime = async (_req: Request, res: Response) => {
    if (!this.allAnimeProvider) {
      return res.status(500).json({ error: 'AllAnime provider not available' })
    }
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'

    const fetchText = async (url: string, extraHeaders: Record<string, string> = {}) => {
      const r = await fetch(url, { headers: { 'User-Agent': UA, ...extraHeaders } })
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`)
      return r.text()
    }

    try {
      const html = await fetchText('https://mkissa.to')
      const assetsMatch = html.match(/assets:\s*"([^"]+)"/)
      const assets = assetsMatch ? assetsMatch[1] : 'https://cdn.mkissa.net/all/mk'
      const entryMatches = [
        ...html.matchAll(/import\(\s*"([^"]+_app\/immutable\/entry\/[^"]+\.js)"/g),
      ]
      if (entryMatches.length < 2) {
        throw new Error('Could not find app entry JS URLs')
      }
      const appUrl = entryMatches.map((m) => m[1]).find((u) => u.includes('/app.'))
      if (!appUrl) throw new Error('Could not find app.js URL')

      const appCode = await fetchText(
        appUrl.startsWith('http') ? appUrl : `https://mkissa.to${appUrl}`
      )
      const chunkNames = [
        ...new Set([...appCode.matchAll(/\.\.\/chunks\/([^"']+\.js)/g)].map((m) => m[1])),
      ]
      if (chunkNames.length === 0) throw new Error('No chunks found in app JS')

      let crypto: { buildId: string; maskHex: string } | null = null
      for (const name of chunkNames) {
        const url = `${assets}/_app/immutable/chunks/${name}`
        try {
          const rangeRes = await fetch(url, {
            headers: { 'User-Agent': UA, Range: 'bytes=0-300000' },
          })
          if (!rangeRes.ok) continue
          const text = await rangeRes.text()
          if (text.includes('const Sf=Ss;') && text.includes('function US()')) {
            crypto = await SettingsController.extractAaCrypto(text)
            break
          }
        } catch {
          /* try next */
        }
      }
      if (!crypto) {
        throw new Error('Could not extract AA crypto constants (buildId/mask)')
      }
      if (!crypto.buildId || !crypto.maskHex) {
        throw new Error('Extracted empty buildId or mask')
      }

      process.env.AA_BUILD_ID = crypto.buildId
      process.env.AA_MASK_HEX = crypto.maskHex
      await this.allAnimeProvider.refreshKey()

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
        lines.push(envLine('AA_BUILD_ID', crypto.buildId))
        lines.push(envLine('AA_MASK_HEX', crypto.maskHex))
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8')
      }
      upsertEnv(path.join(CONFIG.SERVER_ROOT, '.env'))
      upsertEnv(CONFIG.ENV_PATH)

      logger.info({ buildId: crypto.buildId }, 'AllAnime crypto constants recovered')
      res.json({ success: true, buildId: crypto.buildId, maskHex: crypto.maskHex })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error({ err }, 'AllAnime recovery failed')
      res.status(500).json({ success: false, error: message })
    }
  }
}
