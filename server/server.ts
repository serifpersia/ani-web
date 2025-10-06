import express from 'express';
import { genres, tags, studios } from './constants';
import path from 'path';
import cors from 'cors';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import NodeCache from 'node-cache';
import crypto from 'crypto';
import fs from 'fs';
import { parseString } from 'xml2js';
import sqlite3 from 'sqlite3';
import multer from 'multer';
import { initializeDatabase, syncDownOnBoot, syncUp, performWriteTransaction, verifyRclone } from './sync';
import chokidar from 'chokidar';
import logger from './logger';
import { AllAnimeProvider } from './providers/allanime.provider';

declare global {
    namespace Express {
        interface Request {
            db: sqlite3.Database;
        }
    }
}

interface MalAnimeItem {
    series_title: string[];
    my_status: string[];
}

const app = express();
const apiCache = new NodeCache({ stdTTL: 3600 });
const provider = new AllAnimeProvider();

let db: sqlite3.Database;

app.use((req, res, next) => {
    req.db = db;
    next();
});

axiosRetry(axios, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
});

const port = 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

async function streamToString(stream: NodeJS.ReadableStream | null | undefined): Promise<string> {
    if (!stream || typeof stream.pipe !== 'function') return stream as unknown as string;
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
}

app.get('/api/popular/:timeframe', async (req, res) => {
    const timeframe = req.params.timeframe.toLowerCase() as any;
    const cacheKey = `popular-${timeframe}`;
    if (apiCache.has(cacheKey)) return res.json(apiCache.get(cacheKey));
    try {
        const data = await provider.getPopular(timeframe);
        apiCache.set(cacheKey, data);
        res.set('Cache-Control', 'public, max-age=300').json(data);
    } catch (error) {
        logger.error({ err: error }, 'Error fetching popular data');
        res.status(500).send('Error fetching popular data');
    }
});

app.get('/api/schedule/:date', async (req, res) => {
    const dateStr = req.params.date;
    const cacheKey = `schedule-${dateStr}`;
    if (apiCache.has(cacheKey)) return res.json(apiCache.get(cacheKey));
    const requestedDate = new Date(dateStr + 'T00:00:00.000Z');
    if (isNaN(requestedDate.getTime())) return res.status(400).send('Invalid date format.');
    try {
        const data = await provider.getSchedule(requestedDate);
        apiCache.set(cacheKey, data);
        res.set('Cache-Control', 'public, max-age=300').json(data);
    } catch (error) {
        logger.error({ err: error }, 'Error fetching schedule data');
        res.status(500).send('Error fetching schedule data');
    }
});

app.get('/api/proxy', async (req, res) => {
    const { url, referer: dynamicReferer } = req.query;
    try {
        const headers: Record<string, string> = { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' };
        if (dynamicReferer) headers['Referer'] = dynamicReferer as string;
        if (req.headers.range) headers['Range'] = req.headers.range;

        if ((url as string).includes('.m3u8')) {
            const response = await axios.get(url as string, { headers, responseType: 'text', timeout: 15000 });
            const baseUrl = new URL(url as string);
            const rewritten = response.data.split('\n').map((l: string) =>
                (l.trim().length > 0 && !l.startsWith('#'))
                    ? `/api/proxy?url=${encodeURIComponent(new URL(l, baseUrl).href)}&referer=${encodeURIComponent(dynamicReferer as string || 'https://allmanga.to')}`
                    : l
            ).join('\n');
            res.set('Content-Type', 'application/vnd.apple.mpegurl').send(rewritten);
        } else {
            const streamResponse = await axios({ method: 'get', url: url as string, responseType: 'stream', headers, timeout: 20000 });
            res.status(streamResponse.status);
            Object.keys(streamResponse.headers).forEach(key => res.set(key, streamResponse.headers[key]));
            req.on('close', () => streamResponse.data.destroy());
            streamResponse.data.pipe(res);
            streamResponse.data.on('error', (err: any) => {
                if (err.code !== 'ECONNRESET') logger.error({ err }, 'Proxy stream error');
                if (!res.headersSent) res.status(500).send('Stream error');
                res.end();
            });
        }
    } catch (e: any) {
        if (e.response) {
            if (!res.headersSent) res.status(e.response.status).send(`Proxy error: ${e.message}`);
        } else if (e.request) {
            if (!res.headersSent) res.status(504).send(`Proxy error: Gateway timeout.`);
        } else {
            if (!res.headersSent) res.status(500).send(`Proxy error: ${e.message}`);
        }
        if (res.writable) res.end();
    }
});

app.get('/api/skip-times/:showId/:episodeNumber', async (req, res) => {
    const { showId, episodeNumber } = req.params;
    const cacheKey = `skip-${showId}-${episodeNumber}`;
    if (apiCache.has(cacheKey)) return res.json(apiCache.get(cacheKey));
    try {
        const data = await provider.getSkipTimes(showId, episodeNumber);
        apiCache.set(cacheKey, data);
        res.json(data);
    } catch (error) {
        res.json({ found: false, results: [] });
    }
});

app.post('/api/import/mal-xml', multer().single('xmlfile'), async (req, res) => {
    const { erase } = req.body;
    const xml = req.file?.buffer.toString('utf-8');
    if (!xml) return res.status(400).json({ error: 'XML content is required' });

    parseString(xml, async (err, result) => {
        if (err || !result?.myanimelist?.anime) return res.status(400).json({ error: 'Invalid MyAnimeList XML.' });
        
        const animeList: MalAnimeItem[] = result.myanimelist.anime;
        let skippedCount = 0;
        const showsToInsert: any[] = [];

        for (const item of animeList) {
            try {
                const searchResults = await provider.search({ query: item.series_title[0], limit: 1 });
                if (searchResults.length > 0) {
                    showsToInsert.push({ id: searchResults[0]._id, name: searchResults[0].name, thumbnail: searchResults[0].thumbnail, status: item.my_status[0] });
                } else {
                    skippedCount++;
                }
            } catch {
                skippedCount++;
            }
        }

        try {
            await performWriteTransaction(db, (tx) => {
                if (erase) tx.run(`DELETE FROM watchlist`);
                if (showsToInsert.length > 0) {
                    const stmt = tx.prepare(`INSERT OR REPLACE INTO watchlist (id, name, thumbnail, status) VALUES (?, ?, ?, ?)`);
                    showsToInsert.forEach(show => stmt.run(show.id, show.name, show.thumbnail, show.status));
                    stmt.finalize();
                }
            });
            res.json({ imported: showsToInsert.length, skipped: skippedCount });
        } catch (dbError) {
            logger.error({ err: dbError }, 'DB error on MAL import');
            res.status(500).json({ error: 'DB error on MAL import' });
        }
    });
});

async function getContinueWatchingData(db: sqlite3.Database, provider: AllAnimeProvider, limit?: number): Promise<any[]> {
    // List 1: In-Progress
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
    const inProgressShows: any[] = await new Promise((resolve, reject) => {
        db.all(inProgressQuery, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

    // List 2: Up Next/Binge
    const watchingShowsQuery = `
        SELECT
            w.id, w.name, w.thumbnail, w.nativeName, w.englishName,
            (SELECT MAX(we.watchedAt) FROM watched_episodes we WHERE we.showId = w.id) as lastWatchedAt
        FROM watchlist w
        WHERE w.status = 'Watching'
        ORDER BY lastWatchedAt DESC;
    `;
    const watchingShows: any[] = await new Promise((resolve, reject) => {
        db.all(watchingShowsQuery, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

    const upNextShows = [];
    const fullyWatchedShows = [];
    for (const show of watchingShows) {
        try {
            const [epDetails, watchedEpisodesResult] = await Promise.all([
                provider.getEpisodes(show.id, 'sub'), // Assuming 'sub' is default for episode list
                new Promise<any[]>((resolve, reject) => {
                    db.all('SELECT * FROM watched_episodes WHERE showId = ?', [show.id], (err, rows) => {
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

    // Combine & Prioritize
    const combinedList = [];
    const seenShowIds = new Set();

    // Add in-progress shows first
    for (const show of inProgressShows) {
        if (!seenShowIds.has(show.id)) {
            combinedList.push({
                ...show,
                thumbnail: provider.deobfuscateUrl(show.thumbnail)
            });
            seenShowIds.add(show.id);
        }
    }

    // Add up-next shows
    for (const show of upNextShows) {
        if (!seenShowIds.has(show.id)) {
            combinedList.push({
                ...show,
                thumbnail: provider.deobfuscateUrl(show.thumbnail)
            });
            seenShowIds.add(show.id);
        }
    }

    // Add fully-watched shows
    for (const show of fullyWatchedShows) {
        if (!seenShowIds.has(show.id)) {
            combinedList.push({
                ...show,
                thumbnail: provider.deobfuscateUrl(show.thumbnail)
            });
            seenShowIds.add(show.id);
        }
    }

    if (limit) {
        return combinedList.slice(0, limit);
    }

    return combinedList;
}

app.get('/api/continue-watching/all', async (req, res) => {
    try {
        const data = await getContinueWatchingData(req.db, provider);
        res.json(data);
    } catch (error) {
        logger.error({ err: error }, 'DB error on /api/continue-watching/all');
        res.status(500).json({ error: 'DB error' });
    }
});

app.get('/api/continue-watching', async (req, res) => {
    try {
        const data = await getContinueWatchingData(req.db, provider, 8);
        res.json(data);
    } catch (error) {
        logger.error({ err: error }, 'DB error on /api/continue-watching');
        res.status(500).json({ error: 'DB error' });
    }
});

app.post('/api/update-progress', async (req, res) => {
    const { showId, episodeNumber, currentTime, duration, showName, showThumbnail, nativeName, englishName, episodeCount } = req.body;
    try {
        await performWriteTransaction(req.db, (tx) => {
            tx.run('INSERT OR IGNORE INTO shows_meta (id, name, thumbnail, nativeName, englishName) VALUES (?, ?, ?, ?, ?)',
                [showId, showName, provider.deobfuscateUrl(showThumbnail), nativeName, englishName]);
            tx.run(`INSERT OR REPLACE INTO watched_episodes (showId, episodeNumber, watchedAt, currentTime, duration) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)`,
                [showId, episodeNumber, currentTime, duration]);
        });
        res.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, 'DB error on progress update');
        res.status(500).json({ error: 'DB error on progress update' });
    }
});

app.get('/api/episode-progress/:showId/:episodeNumber', (req, res) => {
    const { showId, episodeNumber } = req.params;
    req.db.get('SELECT currentTime, duration FROM watched_episodes WHERE showId = ? AND episodeNumber = ?',
        [showId, episodeNumber], (err, row) => res.status(err ? 500 : 200).json(err ? { error: 'DB error' } : row || { currentTime: 0, duration: 0 }));
});

app.get('/api/watched-episodes/:showId', (req, res) => {
    req.db.all(`SELECT episodeNumber FROM watched_episodes WHERE showId = ?`,
        [req.params.showId], (err, rows: any[]) => res.status(err ? 500 : 200).json(err ? { error: 'DB error' } : rows.map(r => r.episodeNumber)));
});

app.post('/api/continue-watching/remove', async (req, res) => {
    const { showId } = req.body;
    try {
        await performWriteTransaction(req.db, (tx) => {
            tx.run(`DELETE FROM watched_episodes WHERE showId = ?`, [showId]);
            tx.run(`DELETE FROM shows_meta WHERE id = ?`, [showId]);
        });
        res.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, 'DB error on continue-watching remove');
        res.status(500).json({ error: 'DB error' });
    }
});

app.post('/api/watchlist/add', async (req, res) => {
    const { id, name, thumbnail, status, nativeName, englishName } = req.body;
    try {
        await performWriteTransaction(req.db, (tx) => {
            tx.run(`INSERT OR REPLACE INTO watchlist (id, name, thumbnail, status, nativeName, englishName) VALUES (?, ?, ?, ?, ?, ?)`, 
                [id, name, provider.deobfuscateUrl(thumbnail), status || 'Watching', nativeName, englishName]);
        });
        res.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, 'DB error on watchlist add');
        res.status(500).json({ error: 'DB error' });
    }
});

app.get('/api/watchlist/check/:showId', (req, res) => {
    req.db.get('SELECT EXISTS(SELECT 1 FROM watchlist WHERE id = ?) as inWatchlist',
        [req.params.showId], (err, row: any) => res.status(err ? 500 : 200).json(err ? { error: 'DB error' } : { inWatchlist: !!row.inWatchlist }));
});

app.post('/api/watchlist/status', async (req, res) => {
    const { id, status } = req.body;
    try {
        await performWriteTransaction(req.db, (tx) => tx.run(`UPDATE watchlist SET status = ? WHERE id = ?`, [status, id]));
        res.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, 'DB error on watchlist status update');
        res.status(500).json({ error: 'DB error' });
    }
});

app.get('/api/watchlist', (req, res) => {
    const sort = req.query.sort || 'last_added';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 14;
    const offset = (page - 1) * limit;
    const orderByClause = sort === 'name_asc' ? 'ORDER BY name ASC' : sort === 'name_desc' ? 'ORDER BY name DESC' : 'ORDER BY ROWID DESC';

    req.db.get('SELECT COUNT(*) as count FROM watchlist', [], (err, row: any) => {
        if (err) return res.status(500).json({ error: 'DB error on count' });
        res.setHeader('X-Total-Count', row.count.toString());
        req.db.all(`SELECT id as _id, id, name, thumbnail, status, nativeName, englishName FROM watchlist ${orderByClause} LIMIT ? OFFSET ?`, [limit, offset],
            (err, rows) => res.status(err ? 500 : 200).json(err ? { error: 'DB error on data' } : rows));
    });
});

app.post('/api/watchlist/remove', async (req, res) => {
    const { id } = req.body;
    try {
        await performWriteTransaction(req.db, (tx) => tx.run(`DELETE FROM watchlist WHERE id = ?`, [id]));
        res.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, 'DB error on watchlist remove');
        res.status(500).json({ error: 'DB error' });
    }
});

app.get('/api/settings', (req, res) => {
    const key = req.query.key as string;
    if (!key) return res.status(400).json({ error: 'Key is required.' });
    req.db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row: any) => 
        res.status(err ? 500 : 200).json(err ? { error: 'DB error' } : { value: row ? row.value : null }));
});

app.post('/api/settings', async (req, res) => {
    const { key, value } = req.body;
    try {
        await performWriteTransaction(req.db, (tx) => tx.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]));
        res.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, 'DB error on settings update');
        res.status(500).json({ error: 'DB error' });
    }
});

app.get('/api/backup-db', (_req, res) => {
   const dbPath = path.join(__dirname, 'anime.db');
   _req.db.close(err => {
        if (err) return res.status(500).json({ error: 'Failed to close database.' });
        res.download(dbPath, 'ani-web-backup.db', () => initializeDatabase(dbPath).then(newDb => db = newDb));
   });
});

app.post('/api/restore-db', multer({ storage: multer.diskStorage({ destination: (_req, _f, cb) => cb(null, __dirname), filename: (_r, _f, cb) => cb(null, 'anime.db.temp') }) }).single('dbfile'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const tempPath = path.join(__dirname, 'anime.db.temp');
    const dbPath = path.join(__dirname, 'anime.db');
    req.db.close(err => {
        if (err) return res.status(500).json({ error: 'Failed to close database.' });
        fs.rename(tempPath, dbPath, err => {
            initializeDatabase(dbPath).then(newDb => db = newDb);
            if (err) return res.status(500).json({ error: 'Failed to replace database file.' });
            res.json({ success: true, message: 'Database restored. App will refresh.' });
        });
    });
});

app.get('/api/subtitle-proxy', async (req, res) => {
    try {
        const response = await axios.get(req.query.url as string, { responseType: 'text', timeout: 10000 });
        res.set('Content-Type', 'text/vtt; charset=utf-8').send(response.data);
    } catch (e: any) {
        res.status(500).send(`Proxy error: ${e.message}`);
    }
});

app.get('/api/image-proxy', async (req, res) => {
    try {
        const { data: streamData, headers: originalHeaders } = await axios({
            method: 'get', url: req.query.url as string, responseType: 'stream',
            headers: { Referer: 'https://allanime.day', 'User-Agent': 'Mozilla/5.0' }, timeout: 10000, maxRedirects: 5
        });
        res.set('Cache-Control', 'public, max-age=604800, immutable').set('Content-Type', originalHeaders['content-type'] || 'image/webp');
        streamData.pipe(res);
        streamData.on('error', (err: any) => {
            if (err.code !== 'ECONNRESET') logger.error({ err }, 'Image proxy stream error');
            if (!res.headersSent) res.status(500).send('Error streaming image.');
            else res.end();
        });
        res.on('close', () => streamData.destroy());
    } catch (e) {
        logger.error({ err: e }, 'Image proxy error');
        res.status(200).sendFile(path.join(__dirname, '..','public/placeholder.svg'));
    }
});

app.get('/api/video', async (req, res) => {
    const { showId, episodeNumber, mode } = req.query;
    try {
        const data = await provider.getStreamUrls(showId as string, episodeNumber as string, mode as any);
        if (data && data.length > 0) res.json(data);
        else res.status(404).send('No playable video URLs found.');
    } catch (e: any) {
        logger.error({ err: e, showId }, `Error fetching video data`);
        res.status(500).send(`Error fetching video data: ${e.message}`);
    }
});

app.get('/api/episodes', async (req, res) => {
    const { showId, mode } = req.query;
    try {
        const data = await provider.getEpisodes(showId as string, mode as any);
        if (data) res.set('Cache-Control', 'public, max-age=300').json(data);
        else res.status(404).send('Episodes not found.');
    } catch (e: any) {
        res.status(500).send('Error fetching episodes from API');
    }
});

app.get('/api/search', async (req, res) => {
    try {
        const data = await provider.search(req.query);
        res.json(data);
    } catch (error) {
        logger.error({ err: error }, 'Error fetching search data');
        res.status(500).send('Error fetching search data');
    }
});

app.get('/api/seasonal', async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const cacheKey = `seasonal-p${page}`;
    if (apiCache.has(cacheKey)) return res.json(apiCache.get(cacheKey));
    try {
        const data = await provider.getSeasonal(page);
        apiCache.set(cacheKey, data);
        res.set('Cache-Control', 'public, max-age=300').json(data);
    } catch (error) {
        logger.error({ err: error }, 'Error fetching seasonal data');
        res.status(500).send('Error fetching seasonal data');
    }
});

app.get('/api/latest-releases', async (_req, res) => {
    const cacheKey = 'latest-releases';
    if (apiCache.has(cacheKey)) return res.json(apiCache.get(cacheKey));
    try {
        const data = await provider.getLatestReleases();
        apiCache.set(cacheKey, data);
        res.set('Cache-Control', 'public, max-age=300').json(data);
    } catch (error) {
        logger.error({ err: error }, 'Error fetching latest releases');
        res.status(500).send('Error fetching latest releases');
    }
});

app.get('/api/show-meta/:id', async (req, res) => {
    const { id } = req.params;
    const cacheKey = `show-meta-${id}`;
    if (apiCache.has(cacheKey)) return res.json(apiCache.get(cacheKey));
    try {
        const data = await provider.getShowMeta(id);
        if (data) {
            apiCache.set(cacheKey, data);
            res.set('Cache-Control', 'public, max-age=300').json(data);
        } else {
            res.status(404).json({ error: 'Show not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch show metadata' });
    }
});

app.get('/api/show-details/:id', async (req, res) => {
    const { id } = req.params;
    const cacheKey = `show-details-${id}`;
    if (apiCache.has(cacheKey)) {
        return res.json(apiCache.get(cacheKey));
    }
    try {
        const data = await provider.getShowDetails(id);
        if (data) {
            apiCache.set(cacheKey, data, 3600);
            res.json(data);
        } else {
            res.status(404).json({ error: "Not Found on Schedule" });
        }
    } catch (error) {
        res.status(500).json({ error: "Error fetching show details" });
    }
});

app.get('/api/allmanga-details/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const data = await provider.getAllmangaDetails(id);
        res.json(data);
    } catch (error) {
        logger.error({ err: error, animeId: id }, `Error fetching allmanga details for ${id}`);
        res.status(500).json({ error: "Failed to fetch allmanga details" });
    }
});

app.use(express.static(path.join(__dirname, '../../dist')));
app.get(/^(?!\/api).*$/, (_req, res) => res.sendFile(path.join(__dirname, '../../dist/index.html')));
app.get('/api/genres-and-tags', (_req, res) => res.json({ genres, tags, studios }));

async function main() {
    const dbPath = path.join(__dirname, 'anime.db');
    const isSyncEnabled = await verifyRclone();
    db = await initializeDatabase(dbPath);
    logger.info('Database initialized.');

    if (isSyncEnabled) {
        const didSyncDown = await syncDownOnBoot(db, dbPath, 'aniweb_db', () => new Promise(res => db.close(() => res())));
        if (didSyncDown) db = await initializeDatabase(dbPath);

        const watcher = chokidar.watch(dbPath, { persistent: true, ignoreInitial: true });
        let debounceTimer: NodeJS.Timeout;
        watcher.on('change', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => syncUp(db, dbPath, 'aniweb_db'), 15000);
        });

        process.on('SIGINT', async () => {
            clearTimeout(debounceTimer);
            await syncUp(db, dbPath, 'aniweb_db');
            db.close(() => process.exit(0));
        });
    }

    app.listen(port, () => logger.info(`Server is running on http://localhost:${port}`));
}

main().catch(err => {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
});