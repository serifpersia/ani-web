import { Router } from 'express'
import { SettingsController } from '../controllers/settings.controller'
import { AllAnimeProvider } from '../providers/allanime.provider'
import multer from 'multer'
import { CONFIG } from '../config'
import type { Database } from 'sqlite3'

export function createSettingsRouter(
  provider: AllAnimeProvider,
  db: Database,
  initializeDatabase: (path: string) => Promise<Database>
): Router {
  const router = Router()
  const controller = new SettingsController(provider)

  router.get('/settings', controller.getSettings)
  router.post('/settings', controller.updateSettings)
  router.get('/backup-db', controller.backupDatabase)

  const restoreStorage = multer({
    storage: multer.diskStorage({
      destination: (_req, _f, cb) => cb(null, CONFIG.ROOT),
      filename: (_r, _f, cb) => cb(null, `restore_temp.db`),
    }),
  })

  router.post('/restore-db', restoreStorage.single('dbfile'), (req, res) =>
    controller.restoreDatabase(req, res, db, initializeDatabase)
  )

  router.post('/import/mal-xml', multer().single('xmlfile'), controller.importMalXml)

  return router
}
