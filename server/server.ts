import express from 'express';
import path from 'path';
import cors from 'cors';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import NodeCache from 'node-cache';
import fs from 'fs';
import { parseString } from 'xml2js';
import sqlite3 from 'sqlite3';
import multer from 'multer';
import chokidar from 'chokidar';
import logger from './logger';
import { AllAnimeProvider } from './providers/allanime.provider';
import { googleDriveService } from './google';
import { CONFIG } from './config';
import { initializeDatabase, syncDownOnBoot, syncUp, performWriteTransaction, initSyncProvider } from './sync';
import { genres, tags, studios } from './constants';

declare module 'express-serve-static-core' {
    interface Request {
        db: sqlite3.Database;
    }
}

interface MalAnimeItem { series_title: string[]; my_status: string[]; }
interface ShowToInsert { id: string; name: string; thumbnail?: string; status: string; }
interface ContinueWatchingShow { _id: string; id: string; name: string; thumbnail?: string; nativeName?: string; englishName?: string; episodeNumber: string; currentTime: number; duration: number; }
interface WatchingShow { id: string; name: string; thumbnail?: string; nativeName?: string; englishName?: string; lastWatchedAt: string | null; }
interface WatchedEpisode { episodeNumber: string; currentTime: number; duration: number; }

interface CombinedContinueWatchingShow {
    _id: string;
    id: string;
    name: string;
    thumbnail?: string;
    nativeName?: string;
    englishName?: string;
    episodeNumber?: string | number;
    currentTime?: number;
    duration?: number;
    nextEpisodeToWatch?: string;
    newEpisodesCount?: number;
}

const app = express();
const apiCache = new NodeCache({ stdTTL: 3600 });
const provider = new AllAnimeProvider(apiCache);

let db: sqlite3.Database;
let isShuttingDown = false;

async function runSyncSequence() {
    const dbName = CONFIG.IS_DEV ? CONFIG.DB_NAME_DEV : CONFIG.DB_NAME_PROD;
    const dbPath = path.join(CONFIG.ROOT, dbName);
    const remoteFolder = CONFIG.IS_DEV ? CONFIG.REMOTE_FOLDER_DEV : CONFIG.REMOTE_FOLDER_PROD;

    await initSyncProvider();

    const didDownload = await syncDownOnBoot(db, dbPath, remoteFolder, () => {
        return new Promise<void>(resolve => {
            if (db) {
                db.close(() => resolve());
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

async function updateEnvFile(updates: Record<string, string>) {
    const envPath = CONFIG.ENV_PATH;

    let envContent = '';
    if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
    }

    const lines = envContent.split('\n');
    const newLines = [...lines];

    Object.entries(updates).forEach(([key, value]) => {
        let found = false;
        for (let i = 0; i < newLines.length; i++) {
            if (newLines[i].startsWith(`${key}=`)) {
                if (value === '') {
                    newLines.splice(i, 1);
                    i--;
                } else {
                    newLines[i] = `${key}=${value}`;
                }
                found = true;
                break;
            }
        }
        if (!found && value !== '') {
            newLines.push(`${key}=${value}`);
        }
    });

    const finalContent = newLines.join('\n').replace(/\n{2,}/g, '\n').trim() + '\n';
    fs.writeFileSync(envPath, finalContent);
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

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/auth/config-status', (req, res) => {
    const hasConfig = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
    res.json({ hasConfig });
});

app.get('/api/settings/google-auth', (req, res) => {
    res.json({
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || ''
    });
});

app.post('/api/settings/google-auth', async (req, res) => {
    const { clientId, clientSecret } = req.body;

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
});

app.get('/api/auth/google', (req, res) => {
    try {
        const url = googleDriveService.getAuthUrl();
        res.json({ url });
    } catch (error) {
        logger.error({ err: error }, 'Failed to generate auth URL');
        res.status(500).json({ error: 'Auth configuration error' });
    }
});

app.get('/api/auth/google/callback', async (req, res) => {
    const code = req.query.code as string;
    if (code) {
        try {
            await googleDriveService.handleCallback(code);
            const user = await googleDriveService.getUserProfile();

            logger.info("User logged in. Syncing database (please wait)...");
            try {
                await runSyncSequence();
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
    } else {
        res.status(400).send('No code provided');
    }
});

app.get('/api/auth/user', async (req, res) => {
    try {
        const user = await googleDriveService.getUserProfile();
        res.json(user);
    } catch (error) {
        res.json(null);
    }
});

app.post('/api/auth/logout', async (req, res) => {
    await googleDriveService.logout();
    res.json({ success: true });
});


app.get('/api/popular/:timeframe', async (req, res) => {
    const timeframe = req.params.timeframe.toLowerCase() as 'daily' | 'weekly' | 'monthly' | 'all';
    const cacheKey = `popular-${timeframe}`;
    if (apiCache.has(cacheKey)) return res.json(apiCache.get(cacheKey));
    try {
        const data = await provider.getPopular(timeframe);
        apiCache.set(cacheKey, data);
        res.set('Cache-Control', 'public, max-age=300').json(data);
    } catch (error) { res.status(500).send('Error'); }
});

app.get('/api/schedule/:date', async (req, res) => {
    const cacheKey = `schedule-${req.params.date}`;
    if (apiCache.has(cacheKey)) return res.json(apiCache.get(cacheKey));
    try {
        const data = await provider.getSchedule(new Date(req.params.date + 'T00:00:00.000Z'));
        apiCache.set(cacheKey, data);
        res.set('Cache-Control', 'public, max-age=300').json(data);
    } catch (error) { res.status(500).send('Error'); }
});

app.get('/api/proxy', async (req, res) => {
    const { url, referer } = req.query;
    if (!url) return res.status(400).send('URL required');
    try {
        const headers: Record<string, string> = { 'User-Agent': 'Mozilla/5.0' };
        if (referer) headers['Referer'] = referer as string;
        if (req.headers.range) headers['Range'] = req.headers.range;

        if ((url as string).includes('.m3u8')) {
            const resp = await axios.get(url as string, { headers, responseType: 'text' });
            const baseUrl = new URL(url as string);
            const rewritten = resp.data.split('\n').map((l: string) =>
            (l.trim() && !l.startsWith('#'))
            ? `/api/proxy?url=${encodeURIComponent(new URL(l, baseUrl).href)}&referer=${encodeURIComponent(referer as string || '')}`
            : l
            ).join('\n');
            res.set('Content-Type', 'application/vnd.apple.mpegurl').send(rewritten);
        } else {
            const resp = await axios({ method: 'get', url: url as string, responseType: 'stream', headers });
            res.status(resp.status);
            Object.keys(resp.headers).forEach(k => res.set(k, resp.headers[k]));
            resp.data.pipe(res);
        }
    } catch (e) { if (!res.headersSent) res.status(500).send('Proxy error'); }
});

app.get('/api/skip-times/:showId/:episodeNumber', async (req, res) => {
    try {
        const data = await provider.getSkipTimes(req.params.showId, req.params.episodeNumber);
        res.json(data);
    } catch { res.json({ found: false, results: [] }); }
});

app.post('/api/import/mal-xml', multer().single('xmlfile'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const { erase } = req.body;
    parseString(req.file.buffer.toString(), async (err, result) => {
        if (err) return res.status(400).json({ error: 'Invalid XML' });
        const animeList: MalAnimeItem[] = result?.myanimelist?.anime || [];

        let skippedCount = 0;
        const showsToInsert: ShowToInsert[] = [];

        for (const item of animeList) {
            try {
                const searchResults = await provider.search({ query: item.series_title[0] });
                if (searchResults.length > 0) {
                    showsToInsert.push({ id: searchResults[0]._id, name: searchResults[0].name, thumbnail: searchResults[0].thumbnail, status: item.my_status[0] });
                } else {
                    skippedCount++;
                }
            } catch { skippedCount++; }
        }

        try {
            await performWriteTransaction(db, (tx) => {
                if (erase) tx.run('DELETE FROM watchlist');
                const stmt = tx.prepare('INSERT OR REPLACE INTO watchlist (id, name, thumbnail, status) VALUES (?, ?, ?, ?)');
                showsToInsert.forEach(show => stmt.run(show.id, show.name, show.thumbnail, show.status));
                stmt.finalize();
            });
            res.json({ imported: showsToInsert.length, skipped: skippedCount });
        } catch (dbError) {
            logger.error({ err: dbError }, 'Import DB error');
            res.status(500).json({ error: 'DB error' });
        }
    });
});

async function getContinueWatchingData(db: sqlite3.Database, provider: AllAnimeProvider): Promise<{data: CombinedContinueWatchingShow[], total: number}> {

    const inProgressQuery = `
    SELECT
    sm.id as _id, sm.id, sm.name, sm.thumbnail, sm.nativeName, sm.englishName,
    we.episodeNumber, we.currentTime, we.duration
    FROM shows_meta sm
    JOIN (
        SELECT *, ROW_NUMBER() OVER(PARTITION BY showId ORDER BY watchedAt DESC) as rn
        FROM watched_episodes
        WHERE (currentTime / duration) BETWEEN 0.05 AND 0.95
    ) we ON sm.id = we.showId
    WHERE we.rn = 1
    ORDER BY we.watchedAt DESC;
    `;
    const inProgressShows: ContinueWatchingShow[] = await new Promise((resolve, reject) => {
        db.all(inProgressQuery, [], (err, rows: ContinueWatchingShow[]) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

    const watchingShowsQuery = `
    SELECT
    w.id, w.name, w.thumbnail, w.nativeName, w.englishName,
    (SELECT MAX(we.watchedAt) FROM watched_episodes we WHERE we.showId = w.id) as lastWatchedAt
    FROM watchlist w
    WHERE w.status = 'Watching'
    ORDER BY lastWatchedAt DESC;
    `;
    const watchingShows: WatchingShow[] = await new Promise((resolve, reject) => {
        db.all(watchingShowsQuery, [], (err, rows: WatchingShow[]) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

    const upNextShows: CombinedContinueWatchingShow[] = [];
    const fullyWatchedShows: CombinedContinueWatchingShow[] = [];
    for (const show of watchingShows) {
        try {
            const [epDetails, watchedEpisodesResult] = await Promise.all([
                provider.getEpisodes(show.id, 'sub'),
                                                                         new Promise<WatchedEpisode[]>((resolve, reject) => {
                                                                             db.all('SELECT * FROM watched_episodes WHERE showId = ?', [show.id], (err, rows: WatchedEpisode[]) => {
                                                                                 if (err) reject(err);
                                                                                 else resolve(rows);
                                                                             });
                                                                         })
            ]);

            const allEps = epDetails?.episodes?.sort((a, b) => parseFloat(a) - parseFloat(b)) || [];
            const watchedEpsMap = new Map(watchedEpisodesResult.map(r => [r.episodeNumber.toString(), r]));

            const unwatchedEps = allEps.filter(ep => !watchedEpsMap.has(ep));

            if (unwatchedEps.length > 0) {
                upNextShows.push({
                    _id: show.id,
                    id: show.id,
                    name: show.name,
                    thumbnail: show.thumbnail,
                    nativeName: show.nativeName,
                    englishName: show.englishName,
                    nextEpisodeToWatch: unwatchedEps[0],
                    newEpisodesCount: unwatchedEps.length,
                });
            } else if (watchedEpsMap.size > 0) {
                const lastWatchedEpisodeNumber = Math.max(...Array.from(watchedEpsMap.keys()).map(e => parseFloat(e as string)));
                const lastWatchedEpisodeDetails = watchedEpsMap.get(lastWatchedEpisodeNumber.toString());

                if (lastWatchedEpisodeDetails) {
                    fullyWatchedShows.push({
                        _id: show.id,
                        id: show.id,
                        name: show.name,
                        thumbnail: show.thumbnail,
                        nativeName: show.nativeName,
                        englishName: show.englishName,
                        episodeNumber: lastWatchedEpisodeNumber,
                        currentTime: lastWatchedEpisodeDetails.currentTime,
                        duration: lastWatchedEpisodeDetails.duration,
                    });
                }
            }
        } catch (e) {
            logger.error({ err: e, showId: show.id }, 'Error processing show for Up Next list');
        }
    }

    const combinedList: CombinedContinueWatchingShow[] = [];
    const seenShowIds = new Set<string>();

    for (const show of upNextShows) {
        if (!seenShowIds.has(show.id)) {
            combinedList.push({
                ...show,
                thumbnail: provider.deobfuscateUrl(show.thumbnail ?? '')
            });
            seenShowIds.add(show.id);
        }
    }

    for (const show of inProgressShows) {
        if (!seenShowIds.has(show.id)) {
            combinedList.push({
                ...show,
                thumbnail: provider.deobfuscateUrl(show.thumbnail ?? '')
            });
            seenShowIds.add(show.id);
        }
    }

    for (const show of fullyWatchedShows) {
        if (!seenShowIds.has(show.id)) {
            combinedList.push({
                ...show,
                thumbnail: provider.deobfuscateUrl(show.thumbnail ?? '')
            });
            seenShowIds.add(show.id);
        }
    }

    return { data: combinedList, total: combinedList.length };
}

app.get('/api/continue-watching', async (req, res) => {
    try {
        const data = await getContinueWatchingData(req.db, provider);
        res.json(data.data.slice(0, 10)); // Still returning a fixed limit for the main continue watching
    } catch { res.status(500).json({ error: 'DB error' }); }
});

app.get('/api/continue-watching/all', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const offset = (page - 1) * limit;
        const { data: allData, total } = await getContinueWatchingData(req.db, provider);

        res.json({
            data: allData.slice(offset, offset + limit),
                 total,
                 page,
                 limit
        });
    } catch { res.status(500).json({ error: 'DB error' }); }
});

app.post('/api/update-progress', async (req, res) => {
    const { showId, episodeNumber, currentTime, duration, showName, showThumbnail, nativeName, englishName } = req.body;
    try {
        await performWriteTransaction(req.db, (tx) => {
            tx.run('INSERT OR IGNORE INTO shows_meta (id, name, thumbnail, nativeName, englishName) VALUES (?, ?, ?, ?, ?)',
                   [showId, showName, provider.deobfuscateUrl(showThumbnail), nativeName, englishName]);
            tx.run(`INSERT OR REPLACE INTO watched_episodes (showId, episodeNumber, watchedAt, currentTime, duration) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)`,
                   [showId, episodeNumber, currentTime, duration]);
        });
        res.json({ success: true });
    } catch (error) {
        logger.error({err: error}, 'Update progress failed');
        res.status(500).json({ error: 'DB error' });
    }
});

app.post('/api/continue-watching/remove', async (req, res) => {
    const { showId } = req.body;
    try {
        await performWriteTransaction(req.db, (tx) => {
            tx.run('DELETE FROM watched_episodes WHERE showId = ?', [showId]);
        });
        res.json({ success: true });
    } catch { res.status(500).json({ error: 'DB error' }); }
});

app.get('/api/watchlist', (req, res) => {
    const { status, page: pageStr, limit: limitStr } = req.query;
    const page = parseInt(pageStr as string) || 1;
    const limit = parseInt(limitStr as string) || 10;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM watchlist';
    let countQuery = 'SELECT COUNT(*) as total FROM watchlist';
    const params: (string | number)[] = [];

    if (status && status !== 'All') {
        query += ' WHERE status = ?';
        countQuery += ' WHERE status = ?';
        params.push(status as string);
    }

    query += ' ORDER BY rowid DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    req.db.all(query, params, (err, rows: any[]) => {
        if (err) return res.status(500).json({ error: 'DB error', details: err.message });

        req.db.get(countQuery, params.slice(0, -2), (countErr, countRow: { total: number }) => {
            if (countErr) return res.status(500).json({ error: 'DB error', details: countErr.message });
            res.json({
                data: rows.map(row => ({ ...row, _id: row.id })), // Map id to _id
                     total: countRow.total,
                     page,
                     limit
            });
        });
    });
});

app.get('/api/watchlist/check/:showId', (req, res) => {
    req.db.get('SELECT EXISTS(SELECT 1 FROM watchlist WHERE id = ?) as inWatchlist',
               [req.params.showId], (err, row: { inWatchlist: number }) => res.json({ inWatchlist: !!row.inWatchlist }));
});

app.get('/api/episode-progress/:showId/:episodeNumber', (req, res) => {
    req.db.get('SELECT currentTime, duration FROM watched_episodes WHERE showId = ? AND episodeNumber = ?',
               [req.params.showId, req.params.episodeNumber], (err, row) => res.json(row || { currentTime: 0, duration: 0 }));
});

app.get('/api/watched-episodes/:showId', (req, res) => {
    req.db.all(`SELECT episodeNumber FROM watched_episodes WHERE showId = ?`,
               [req.params.showId], (err, rows: { episodeNumber: string }[]) => res.json(rows ? rows.map(r => r.episodeNumber) : []));
});

app.post('/api/watchlist/add', async (req, res) => {
    const { id, name, thumbnail, status, nativeName, englishName } = req.body;
    try {
        await performWriteTransaction(req.db, (tx) => {
            tx.run('INSERT OR REPLACE INTO watchlist (id, name, thumbnail, status, nativeName, englishName) VALUES (?, ?, ?, ?, ?, ?)',
                   [id, name, provider.deobfuscateUrl(thumbnail), status || 'Watching', nativeName, englishName]);
        });
        res.json({ success: true });
    } catch { res.status(500).json({ error: 'DB error' }); }
});

app.post('/api/watchlist/remove', async (req, res) => {
    const { id } = req.body;
    try {
        await performWriteTransaction(req.db, (tx) => {
            tx.run('DELETE FROM watchlist WHERE id = ?', [id]);
        });
        res.json({ success: true });
    } catch { res.status(500).json({ error: 'DB error' }); }
});

app.post('/api/watchlist/status', async (req, res) => {
    const { id, status } = req.body;
    try {
        await performWriteTransaction(req.db, (tx) => {
            tx.run('UPDATE watchlist SET status = ? WHERE id = ?', [status, id]);
        });
        res.json({ success: true });
    } catch { res.status(500).json({ error: 'DB error' }); }
});

app.get('/api/settings', (req, res) => {
    req.db.get('SELECT value FROM settings WHERE key = ?', [req.query.key], (err, row: any) =>
    res.json({ value: row ? row.value : null }));
});

app.post('/api/settings', async (req, res) => {
    try {
        await performWriteTransaction(req.db, (tx) => {
            tx.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [req.body.key, req.body.value]);
        });
        res.json({ success: true });
    } catch { res.status(500).json({ error: 'DB error' }); }
});

app.get('/api/backup-db', (_req, res) => {
    const dbName = CONFIG.IS_DEV ? CONFIG.DB_NAME_DEV : CONFIG.DB_NAME_PROD;
    const dbPath = path.join(CONFIG.ROOT, dbName);
    const backupPath = path.join(CONFIG.ROOT, 'ani-web-backup.db');
    fs.copyFile(dbPath, backupPath, (err) => {
        if(err) return res.status(500).json({error: 'Backup failed'});
        res.download(backupPath, 'ani-web-backup.db', () => {
            fs.unlink(backupPath, () => {});
        });
    });
});

app.post('/api/restore-db', multer({ storage: multer.diskStorage({ destination: (_req, _f, cb) => cb(null, CONFIG.ROOT), filename: (_r, _f, cb) => cb(null, `restore_temp.db`) }) }).single('dbfile'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const dbName = CONFIG.IS_DEV ? CONFIG.DB_NAME_DEV : CONFIG.DB_NAME_PROD;
    const tempPath = path.join(CONFIG.ROOT, `restore_temp.db`);
    const dbPath = path.join(CONFIG.ROOT, dbName);

    db.close(err => {
        if (err) return res.status(500).json({ error: 'Failed to close database.' });
        fs.rename(tempPath, dbPath, err => {
            initializeDatabase(dbPath).then(newDb => db = newDb);
            if (err) return res.status(500).json({ error: 'Failed to replace database file.' });
            res.json({ success: true, message: 'Database restored.' });
        });
    });
});

app.get('/api/subtitle-proxy', async (req, res) => {
    try {
        const response = await axios.get(req.query.url as string, { responseType: 'text', timeout: 10000 });
        res.set('Content-Type', 'text/vtt; charset=utf-8').send(response.data);
    } catch (e) { res.status(500).send('Proxy error'); }
});

app.get('/api/image-proxy', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL required');
    try {
        const imageResponse = await axios({ method: 'get', url: url as string, responseType: 'arraybuffer', headers: { Referer: 'https://allanime.day', 'User-Agent': 'Mozilla/5.0' } });
        res.set('Content-Type', imageResponse.headers['content-type']);
        res.set('Cache-Control', 'public, max-age=604800, immutable');
        res.send(imageResponse.data);
    } catch (e) { res.status(200).sendFile(path.join(__dirname, '..','public/placeholder.svg')); }
});

app.get('/api/video', async (req, res) => {
    try { res.json(await provider.getStreamUrls(req.query.showId as string, req.query.episodeNumber as string, req.query.mode as any)); } catch { res.status(500).send('Error'); }
});
app.get('/api/episodes', async (req, res) => {
    try { res.json(await provider.getEpisodes(req.query.showId as string, req.query.mode as any)); } catch { res.status(500).send('Error'); }
});
app.get('/api/search', async (req, res) => {
    try { res.json(await provider.search(req.query)); } catch { res.status(500).send('Error'); }
});
app.get('/api/seasonal', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        res.json(await provider.getSeasonal(page));
    } catch { res.status(500).send('Error'); }
});
app.get('/api/latest-releases', async (req, res) => {
    try { res.json(await provider.getLatestReleases()); } catch { res.status(500).send('Error'); }
});
app.get('/api/show-meta/:id', async (req, res) => {
    try { res.json(await provider.getShowMeta(req.params.id)); } catch { res.status(500).send('Error'); }
});
app.get('/api/show-details/:id', async (req, res) => {
    try { res.json(await provider.getShowDetails(req.params.id)); } catch { res.status(404).send('Not found'); }
});
app.get('/api/allmanga-details/:id', async (req, res) => {
    try { res.json(await provider.getAllmangaDetails(req.params.id)); } catch { res.status(500).send('Error'); }
});
app.get('/api/genres-and-tags', (req, res) => res.json({ genres, tags, studios }));

if (!CONFIG.IS_DEV) {

    const frontendPath = path.resolve(__dirname, '../../dist');
    const indexHtml = path.join(frontendPath, 'index.html');

    logger.info(`Serving frontend from: ${frontendPath}`);

    app.use(express.static(frontendPath));

    app.get(/^(?!\/api).+/, (req, res) => {
        res.sendFile(indexHtml, (err) => {
            if (err) {
                logger.error({ err }, `Failed to serve index.html from ${indexHtml}`);
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
        try { fs.unlinkSync(dbPath); } catch {}
    }

    db = await initializeDatabase(dbPath);
    logger.info(`Database initialized at ${dbPath}`);

    await runSyncSequence();

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
