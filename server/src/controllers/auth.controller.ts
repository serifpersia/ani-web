import { Request, Response } from 'express'
import logger from '../logger'
import { googleDriveService } from '../google'
import { DatabaseWrapper } from '../db'
import { initializeDatabase, syncDownOnBoot, initSyncProvider } from '../sync'
import { CONFIG } from '../config'
import { rcloneService } from '../rclone'
import path from 'path'

export class AuthController {
  private runSyncSequence: (db: DatabaseWrapper) => Promise<void>

  constructor(runSyncSequence: (db: DatabaseWrapper) => Promise<void>) {
    this.runSyncSequence = runSyncSequence
  }

  getConfigStatus = (_req: Request, res: Response) => {
    const hasConfig = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET
    res.json({ hasConfig })
  }

  getGoogleAuthSettings = (_req: Request, res: Response) => {
    res.json({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    })
  }

  updateGoogleAuthSettings = async (req: Request, res: Response) => {
    const { clientId, clientSecret } = req.body
    const { updateEnvFile } = await import('../utils/env.utils')

    try {
      const updates: Record<string, string> = {}

      if (typeof clientId === 'string') {
        updates.GOOGLE_CLIENT_ID = clientId
      }

      if (typeof clientSecret === 'string') {
        updates.GOOGLE_CLIENT_SECRET = clientSecret
      }

      await updateEnvFile(updates)
      res.json({ success: true })
    } catch (error) {
      logger.error({ err: error }, 'Failed to update .env file')
      res.status(500).json({ error: 'Failed to save configuration' })
    }
  }

  getRcloneSettings = async (_req: Request, res: Response) => {
    try {
      const remotes = await rcloneService.listRemotes()
      res.json({
        remote: CONFIG.RCLONE_REMOTE || '',
        availableRemotes: remotes,
        activeRemote: rcloneService.isActive() ? rcloneService.getRemoteName() : null,
      })
    } catch {
      res.status(500).json({ error: 'Failed to fetch Rclone settings' })
    }
  }

  updateRcloneSettings = async (req: Request, res: Response) => {
    const { remote } = req.body
    const { updateEnvFile } = await import('../utils/env.utils')

    try {
      await updateEnvFile({
        RCLONE_REMOTE: remote,
      })
      res.json({ success: true })
    } catch (error) {
      logger.error({ err: error }, 'Failed to update .env for Rclone')
      res.status(500).json({ error: 'Failed to save Rclone configuration' })
    }
  }

  getAuthUrl = (_req: Request, res: Response) => {
    try {
      const url = googleDriveService.getAuthUrl()
      res.json({ url })
    } catch (error) {
      logger.error({ err: error }, 'Failed to generate auth URL')
      res.status(500).json({ error: 'Auth configuration error' })
    }
  }

  handleCallback = async (req: Request, res: Response) => {
    const code = req.query.code as string
    if (!code) {
      return res.status(400).send('No code provided')
    }

    try {
      await googleDriveService.handleCallback(code)
      const user = await googleDriveService.getUserProfile()

      logger.info('User logged in. Syncing database (please wait)...')
      try {
        await this.runSyncSequence(req.db)
      } catch (err) {
        logger.error({ err }, 'Post-login sync failed')
      }

      const responseHtml = `
            <html>
            <body>
            <h1>Authentication Successful</h1>
            <p>Database synced. Closing window...</p>
            <script>
            if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', user: ${JSON.stringify(user)} }, '*');
                window.close();
            } else {
                window.location.href = '/';
            }
            </script>
            </body>
            </html>
            `
      res.send(responseHtml)
    } catch (error) {
      logger.error({ err: error }, 'Auth callback failed')
      res.status(500).send('Authentication failed')
    }
  }

  getUserProfile = async (_req: Request, res: Response) => {
    try {
      const user = await googleDriveService.getUserProfile()
      res.json(user)
    } catch (error) {
      res.json(null)
    }
  }

  logout = async (_req: Request, res: Response) => {
    await googleDriveService.logout()
    res.json({ success: true })
  }
}
