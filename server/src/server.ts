import express from 'express'
import path from 'path'
import cors from 'cors'
import compression from 'compression'
import NodeCache from 'node-cache'
import fs from 'fs'
import { DatabaseWrapper } from './db'
import chokidar from 'chokidar'
import logger from './logger'

import { AllAnimeProvider } from './providers/allanime.provider'
import { HiAnimeProvider } from './providers/hianime.provider'
import { AnimePaheProvider } from './providers/animepahe.provider'
import { _123AnimeProvider as Anime123Provider } from './providers/123anime.provider'
import { googleDriveService } from './google'
import { CONFIG } from './config'
import { initializeDatabase, syncDownOnBoot, syncUp, initSyncProvider } from './sync'
import { createAuthRouter } from './routes/auth.routes'
import { createWatchlistRouter } from './routes/watchlist.routes'
import { createDataRouter } from './routes/data.routes'
import { createProxyRouter } from './routes/proxy.routes'
import { createSettingsRouter } from './routes/settings.routes'
import { createInsightsRouter } from './routes/insights.routes'

declare module 'express-serve-static-core' {
  interface Request {
    db: DatabaseWrapper
  }
}

const app = express()
const apiCache = new NodeCache({ stdTTL: 3600 })

const allAnimeProvider = new AllAnimeProvider(apiCache)
const hiAnimeProvider = new HiAnimeProvider(apiCache)
const animePaheProvider = new AnimePaheProvider(apiCache)
const _123AnimeProvider = new Anime123Provider(apiCache)

const providers = {
  allanime: allAnimeProvider,
  hianime: hiAnimeProvider,
  animepahe: animePaheProvider,
  '123anime': _123AnimeProvider,
}

let db: DatabaseWrapper
let isShuttingDown = false

async function runSyncSequence(database: DatabaseWrapper) {
  const dbName = CONFIG.IS_DEV ? CONFIG.DB_NAME_DEV : CONFIG.DB_NAME_PROD
  const dbPath = path.join(CONFIG.ROOT, dbName)
  const remoteFolder = CONFIG.IS_DEV ? CONFIG.REMOTE_FOLDER_DEV : CONFIG.REMOTE_FOLDER_PROD

  await initSyncProvider()

  const didDownload = await syncDownOnBoot(database, dbPath, remoteFolder, () => {
    return new Promise<void>((resolve) => {
      if (database && !database.isClosedCheck()) {
        database.checkpoint()
        database.close(() => resolve())
      } else {
        resolve()
      }
    })
  })

  if (didDownload) {
    db = await initializeDatabase(dbPath)
    logger.info('Database re-initialized after sync.')
  }
}

app.use((req, res, next) => {
  if (isShuttingDown) {
    return res.status(503).send('Server is shutting down...')
  }
  if (!db) {
    return res.status(503).send('Database initializing...')
  }
  req.db = db
  next()
})

// axiosRetry is applied only on the dedicated proxy axiosInstance (proxy.controller.ts)
// to avoid amplifying retries on providers that already have their own fallback logic.

app.use(
  compression({
    level: 2,
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false
      }
      return compression.filter(req, res)
    },
  })
)

app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.use(
  '/api/auth',
  createAuthRouter((database) => runSyncSequence(database))
)

app.use('/api', createWatchlistRouter(allAnimeProvider))
app.use('/api', createDataRouter(apiCache, providers))
app.use('/api', createProxyRouter())
app.use('/api', createInsightsRouter(allAnimeProvider))
app.use(
  '/api',
  createSettingsRouter(
    allAnimeProvider,
    () => db,
    initializeDatabase,
    (newDb) => {
      db = newDb
    }
  )
)

if (!CONFIG.IS_DEV) {
  const frontendPath = path.join(CONFIG.PACKAGE_ROOT, 'client', 'dist')
  logger.info(`Serving frontend from: ${frontendPath}`)
  app.use(express.static(frontendPath))

  app.get(/^(?!\/api).+/, (req, res) => {
    res.sendFile('index.html', { root: frontendPath }, (err) => {
      if (err) {
        logger.error({ err }, `Failed to serve index.html from ${frontendPath}`)
        if (!res.headersSent) {
          res.status(500).send('Server Error: Frontend build not found.')
        }
      }
    })
  })
}

async function main() {
  logger.info('DEBUG: main() started')
  const dbName = CONFIG.IS_DEV ? CONFIG.DB_NAME_DEV : CONFIG.DB_NAME_PROD
  const dbPath = path.join(CONFIG.ROOT, dbName)
  const remoteFolder = CONFIG.IS_DEV ? CONFIG.REMOTE_FOLDER_DEV : CONFIG.REMOTE_FOLDER_PROD

  db = await initializeDatabase(dbPath)
  logger.info(`Database initialized at ${dbPath}`)

  await runSyncSequence(db)

  if (!fs.existsSync(CONFIG.LOCAL_MANIFEST_PATH)) {
    fs.writeFileSync(CONFIG.LOCAL_MANIFEST_PATH, JSON.stringify({ version: 0 }))
  }

  const watcher = chokidar.watch(CONFIG.LOCAL_MANIFEST_PATH, {
    persistent: true,
    ignoreInitial: true,
  })
  let debounceTimer: NodeJS.Timeout

  const expressServer = app.listen(CONFIG.PORT, () => {
    logger.info(`Server running on http://localhost:${CONFIG.PORT}`)
  })

  watcher.on('change', () => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => syncUp(db, dbPath, remoteFolder), 5000)
  })

  const shutdown = async (signal?: string) => {
    if (isShuttingDown) return
    isShuttingDown = true
    clearTimeout(debounceTimer)
    // Close the watcher first to prevent a stale 'change' event from arming
    // a new debounce timer that would call syncUp on an already-closed database.
    await watcher.close()

    if (expressServer) {
      expressServer.close()
    }

    try {
      await syncUp(db, dbPath, remoteFolder)
    } catch (e) {
      console.error('Sync failed:', e)
    }

    db.close(() => {
      console.log('[SERVER_EXIT]')
      setTimeout(() => {
        if (signal === 'SIGUSR2') {
          process.kill(process.pid, 'SIGUSR2')
        } else {
          process.exit(0)
        }
      }, 600)
    })
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.once('SIGUSR2', () => shutdown('SIGUSR2'))

  app.post('/api/internal/shutdown', (req, res) => {
    if (req.ip === '::1' || req.ip === '127.0.0.1' || req.ip === '::ffff:127.0.0.1') {
      res.status(200).json({ message: 'Shutting down' })
      setTimeout(() => shutdown(), 500)
    } else {
      res.status(403).send('Forbidden')
    }
  })
}

main().catch((err) => {
  console.error('Server failed to start:', err)
  process.exit(1)
})
