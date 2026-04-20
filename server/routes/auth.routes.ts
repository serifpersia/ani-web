import { Router } from 'express'
import { AuthController } from '../controllers/auth.controller'
import { DatabaseWrapper } from '../db'

export function createAuthRouter(runSyncSequence: (db: DatabaseWrapper) => Promise<void>): Router {
  const router = Router()
  const controller = new AuthController(runSyncSequence)

  router.get('/config-status', controller.getConfigStatus)
  router.get('/google-auth', controller.getGoogleAuthSettings)
  router.post('/google-auth', controller.updateGoogleAuthSettings)
  router.get('/settings/rclone', controller.getRcloneSettings)
  router.post('/settings/rclone', controller.updateRcloneSettings)
  router.get('/google', controller.getAuthUrl)
  router.get('/google/callback', controller.handleCallback)
  router.get('/user', controller.getUserProfile)
  router.post('/logout', controller.logout)

  return router
}
