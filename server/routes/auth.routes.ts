import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import sqlite3 from 'sqlite3';

export function createAuthRouter(runSyncSequence: (db: sqlite3.Database) => Promise<void>): Router {
    const router = Router();
    const controller = new AuthController(runSyncSequence);

    router.get('/config-status', controller.getConfigStatus);
    router.get('/google-auth', controller.getGoogleAuthSettings);
    router.post('/google-auth', controller.updateGoogleAuthSettings);
    router.get('/google', controller.getAuthUrl);
    router.get('/google/callback', controller.handleCallback);
    router.get('/user', controller.getUserProfile);
    router.post('/logout', controller.logout);

    return router;
}