import express from 'express';
import path from 'path';
import cors from 'cors';
import compression from 'compression';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import NodeCache from 'node-cache';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import chokidar from 'chokidar';
import logger from './logger';
import { AllAnimeProvider } from './providers/allanime.provider';
import { googleDriveService } from './google';
import { CONFIG } from './config';
import { initializeDatabase, syncDownOnBoot, syncUp, initSyncProvider } from './sync';


import { createAuthRouter } from './routes/auth.routes';
import { createWatchlistRouter } from './routes/watchlist.routes';
import { createDataRouter } from './routes/data.routes';
import { createProxyRouter } from './routes/proxy.routes';
import { createSettingsRouter } from './routes/settings.routes';
import { createInsightsRouter } from './routes/insights.routes';

declare module 'express-serve-static-core' {
    interface Request {
        db: sqlite3.Database;
    }
}

const app = express();
const apiCache = new NodeCache({ stdTTL: 3600 });
const provider = new AllAnimeProvider(apiCache);

let db: sqlite3.Database;
let isShuttingDown = false;

async function runSyncSequence(database: sqlite3.Database) {
    const dbName = CONFIG.IS_DEV ? CONFIG.DB_NAME_DEV : CONFIG.DB_NAME_PROD;
    const dbPath = path.join(CONFIG.ROOT, dbName);
    const remoteFolder = CONFIG.IS_DEV ? CONFIG.REMOTE_FOLDER_DEV : CONFIG.REMOTE_FOLDER_PROD;

    await initSyncProvider();

    const didDownload = await syncDownOnBoot(database, dbPath, remoteFolder, () => {
        return new Promise<void>(resolve => {
            if (database) {
                database.close(() => resolve());
            } else {
                resolve();
            }
        });
    });

    if (didDownload) {
        db = await initializeDatabase(dbPath);
        logger.info("Database re-initialized after sync.");
    }
}


app.use((req, res, next) => {
    if (isShuttingDown) {
        return res.status(503).send('Server is shutting down...');
    }
    if (!db) {
        return res.status(503).send('Database initializing...');
    }
    req.db = db;
    next();
});

axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });

// Enable gzip/brotli compression for all responses
app.use(compression({
    level: 6, // Balance between compression ratio and speed
    threshold: 1024, // Only compress responses larger than 1KB
    filter: (req, res) => {
        // Don't compress if client doesn't support it
        if (req.headers['x-no-compression']) {
            return false;
        }
        // Use compression filter
        return compression.filter(req, res);
    }
}));

app.use(cors());
app.use(express.json({ limit: '10mb' }));


app.use('/api/auth', createAuthRouter((database) => runSyncSequence(database)));
app.use('/api/settings', createAuthRouter((database) => runSyncSequence(database)));
app.use('/api', createWatchlistRouter(provider));
app.use('/api', createDataRouter(apiCache, provider));
app.use('/api', createProxyRouter());
app.use('/api', createInsightsRouter(provider));



if (!CONFIG.IS_DEV) {
    const frontendPath = path.resolve(__dirname, '../../client/dist');
    logger.info(`Serving frontend from: ${frontendPath}`);

    app.use(express.static(frontendPath));

    app.get(/^(?!\/api).+/, (req, res) => {
        res.sendFile('index.html', { root: frontendPath }, (err) => {
            if (err) {
                logger.error({ err }, `Failed to serve index.html from ${frontendPath}`);
                if (!res.headersSent) {
                    res.status(500).send("Server Error: Frontend build not found.");
                }
            }
        });
    });
}

async function main() {
    const dbName = CONFIG.IS_DEV ? CONFIG.DB_NAME_DEV : CONFIG.DB_NAME_PROD;
    const dbPath = path.join(CONFIG.ROOT, dbName);
    const remoteFolder = CONFIG.IS_DEV ? CONFIG.REMOTE_FOLDER_DEV : CONFIG.REMOTE_FOLDER_PROD;

    if (CONFIG.IS_DEV && fs.existsSync(dbPath)) {
        try { fs.unlinkSync(dbPath); } catch { }
    }

    db = await initializeDatabase(dbPath);
    logger.info(`Database initialized at ${dbPath}`);

    app.use('/api', createSettingsRouter(provider, db, initializeDatabase));

    await runSyncSequence(db);

    const watcher = chokidar.watch(dbPath, { persistent: true, ignoreInitial: true });
    let debounceTimer: NodeJS.Timeout;

    watcher.on('change', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => syncUp(db, dbPath, remoteFolder), 15000);
    });

    const shutdown = async () => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        console.log("\nServer shutting down. Syncing...");
        clearTimeout(debounceTimer);
        try {
            await syncUp(db, dbPath, remoteFolder);
            console.log("Sync complete.");
        } catch (e) {
            console.error("Sync failed:", e);
        }
        db.close(() => process.exit(0));
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    app.listen(CONFIG.PORT, () => {
        logger.info(`Server running on http://localhost:${CONFIG.PORT}`);
    });
}

main().catch(err => {
    console.error("Server failed to start:", err);
    process.exit(1);
});