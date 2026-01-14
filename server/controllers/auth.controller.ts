import { Request, Response } from 'express';
import logger from '../logger';
import { googleDriveService } from '../google';
import sqlite3 from 'sqlite3';
import { initializeDatabase, syncDownOnBoot, initSyncProvider } from '../sync';
import { CONFIG } from '../config';
import path from 'path';

export class AuthController {
    private runSyncSequence: (db: sqlite3.Database) => Promise<void>;

    constructor(runSyncSequence: (db: sqlite3.Database) => Promise<void>) {
        this.runSyncSequence = runSyncSequence;
    }

    getConfigStatus = (_req: Request, res: Response) => {
        const hasConfig = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
        res.json({ hasConfig });
    };

    getGoogleAuthSettings = (_req: Request, res: Response) => {
        res.json({
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || ''
        });
    };

    updateGoogleAuthSettings = async (req: Request, res: Response) => {
        const { clientId, clientSecret } = req.body;
        const { updateEnvFile } = await import('../utils/env.utils');

        try {
            await updateEnvFile({
                GOOGLE_CLIENT_ID: clientId,
                GOOGLE_CLIENT_SECRET: clientSecret
            });
            res.json({ success: true });
        } catch (error) {
            logger.error({ err: error }, 'Failed to update .env file');
            res.status(500).json({ error: 'Failed to save configuration' });
        }
    };

    getAuthUrl = (_req: Request, res: Response) => {
        try {
            const url = googleDriveService.getAuthUrl();
            res.json({ url });
        } catch (error) {
            logger.error({ err: error }, 'Failed to generate auth URL');
            res.status(500).json({ error: 'Auth configuration error' });
        }
    };

    handleCallback = async (req: Request, res: Response) => {
        const code = req.query.code as string;
        if (!code) {
            return res.status(400).send('No code provided');
        }

        try {
            await googleDriveService.handleCallback(code);
            const user = await googleDriveService.getUserProfile();

            logger.info("User logged in. Syncing database (please wait)...");
            try {
                await this.runSyncSequence(req.db);
            } catch (err) {
                logger.error({ err }, "Post-login sync failed");
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
            `;
            res.send(responseHtml);

        } catch (error) {
            logger.error({ err: error }, 'Auth callback failed');
            res.status(500).send('Authentication failed');
        }
    };

    getUserProfile = async (_req: Request, res: Response) => {
        try {
            const user = await googleDriveService.getUserProfile();
            res.json(user);
        } catch (error) {
            res.json(null);
        }
    };

    logout = async (_req: Request, res: Response) => {
        await googleDriveService.logout();
        res.json({ success: true });
    };
}
