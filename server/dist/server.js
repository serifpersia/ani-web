"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
const axios_1 = __importDefault(require("axios"));
const axios_retry_1 = __importDefault(require("axios-retry"));
const node_cache_1 = __importDefault(require("node-cache"));
const fs_1 = __importDefault(require("fs"));
const xml2js_1 = require("xml2js");
const multer_1 = __importDefault(require("multer"));
const chokidar_1 = __importDefault(require("chokidar"));
const logger_1 = __importDefault(require("./logger"));
const allanime_provider_1 = require("./providers/allanime.provider");
const google_1 = require("./google");
const config_1 = require("./config");
const sync_1 = require("./sync");
const constants_1 = require("./constants");
const app = (0, express_1.default)();
const apiCache = new node_cache_1.default({ stdTTL: 3600 });
const provider = new allanime_provider_1.AllAnimeProvider(apiCache);
let db;
let isShuttingDown = false;
async function runSyncSequence() {
    const dbName = config_1.CONFIG.IS_DEV ? config_1.CONFIG.DB_NAME_DEV : config_1.CONFIG.DB_NAME_PROD;
    const dbPath = path_1.default.join(config_1.CONFIG.ROOT, dbName);
    const remoteFolder = config_1.CONFIG.IS_DEV ? config_1.CONFIG.REMOTE_FOLDER_DEV : config_1.CONFIG.REMOTE_FOLDER_PROD;
    await (0, sync_1.initSyncProvider)();
    const didDownload = await (0, sync_1.syncDownOnBoot)(db, dbPath, remoteFolder, () => {
        return new Promise(resolve => {
            if (db) {
                db.close(() => resolve());
            }
            else {
                resolve();
            }
        });
    });
    if (didDownload) {
        db = await (0, sync_1.initializeDatabase)(dbPath);
        logger_1.default.info("Database re-initialized after sync.");
    }
}
async function updateEnvFile(updates) {
    const envPath = config_1.CONFIG.ENV_PATH;
    let envContent = '';
    if (fs_1.default.existsSync(envPath)) {
        envContent = fs_1.default.readFileSync(envPath, 'utf8');
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
                }
                else {
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
    fs_1.default.writeFileSync(envPath, finalContent);
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
(0, axios_retry_1.default)(axios_1.default, { retries: 3, retryDelay: axios_retry_1.default.exponentialDelay });
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
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
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to update .env file');
        res.status(500).json({ error: 'Failed to save configuration' });
    }
});
app.get('/api/auth/google', (req, res) => {
    try {
        const url = google_1.googleDriveService.getAuthUrl();
        res.json({ url });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to generate auth URL');
        res.status(500).json({ error: 'Auth configuration error' });
    }
});
app.get('/api/auth/google/callback', async (req, res) => {
    const code = req.query.code;
    if (code) {
        try {
            await google_1.googleDriveService.handleCallback(code);
            const user = await google_1.googleDriveService.getUserProfile();
            logger_1.default.info("User logged in. Syncing database (please wait)...");
            try {
                await runSyncSequence();
            }
            catch (err) {
                logger_1.default.error({ err }, "Post-login sync failed");
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
        }
        catch (error) {
            logger_1.default.error({ err: error }, 'Auth callback failed');
            res.status(500).send('Authentication failed');
        }
    }
    else {
        res.status(400).send('No code provided');
    }
});
app.get('/api/auth/user', async (req, res) => {
    try {
        const user = await google_1.googleDriveService.getUserProfile();
        res.json(user);
    }
    catch (error) {
        res.json(null);
    }
});
app.post('/api/auth/logout', async (req, res) => {
    await google_1.googleDriveService.logout();
    res.json({ success: true });
});
app.get('/api/popular/:timeframe', async (req, res) => {
    const timeframe = req.params.timeframe.toLowerCase();
    const cacheKey = `popular-${timeframe}`;
    if (apiCache.has(cacheKey))
        return res.json(apiCache.get(cacheKey));
    try {
        const data = await provider.getPopular(timeframe);
        apiCache.set(cacheKey, data);
        res.set('Cache-Control', 'public, max-age=300').json(data);
    }
    catch (error) {
        res.status(500).send('Error');
    }
});
app.get('/api/schedule/:date', async (req, res) => {
    const cacheKey = `schedule-${req.params.date}`;
    if (apiCache.has(cacheKey))
        return res.json(apiCache.get(cacheKey));
    try {
        const data = await provider.getSchedule(new Date(req.params.date + 'T00:00:00.000Z'));
        apiCache.set(cacheKey, data);
        res.set('Cache-Control', 'public, max-age=300').json(data);
    }
    catch (error) {
        res.status(500).send('Error');
    }
});
app.get('/api/proxy', async (req, res) => {
    const { url, referer } = req.query;
    if (!url)
        return res.status(400).send('URL required');
    try {
        const headers = { 'User-Agent': 'Mozilla/5.0' };
        if (referer)
            headers['Referer'] = referer;
        if (req.headers.range)
            headers['Range'] = req.headers.range;
        if (url.includes('.m3u8')) {
            const resp = await axios_1.default.get(url, { headers, responseType: 'text' });
            const baseUrl = new URL(url);
            const rewritten = resp.data.split('\n').map((l) => (l.trim() && !l.startsWith('#'))
                ? `/api/proxy?url=${encodeURIComponent(new URL(l, baseUrl).href)}&referer=${encodeURIComponent(referer || '')}`
                : l).join('\n');
            res.set('Content-Type', 'application/vnd.apple.mpegurl').send(rewritten);
        }
        else {
            const resp = await (0, axios_1.default)({ method: 'get', url: url, responseType: 'stream', headers });
            res.status(resp.status);
            Object.keys(resp.headers).forEach(k => res.set(k, resp.headers[k]));
            resp.data.pipe(res);
        }
    }
    catch (e) {
        if (!res.headersSent)
            res.status(500).send('Proxy error');
    }
});
app.get('/api/skip-times/:showId/:episodeNumber', async (req, res) => {
    try {
        const data = await provider.getSkipTimes(req.params.showId, req.params.episodeNumber);
        res.json(data);
    }
    catch {
        res.json({ found: false, results: [] });
    }
});
app.post('/api/import/mal-xml', (0, multer_1.default)().single('xmlfile'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'No file' });
    const { erase } = req.body;
    (0, xml2js_1.parseString)(req.file.buffer.toString(), async (err, result) => {
        if (err)
            return res.status(400).json({ error: 'Invalid XML' });
        const animeList = result?.myanimelist?.anime || [];
        let skippedCount = 0;
        const showsToInsert = [];
        for (const item of animeList) {
            try {
                const searchResults = await provider.search({ query: item.series_title[0] });
                if (searchResults.length > 0) {
                    showsToInsert.push({ id: searchResults[0]._id, name: searchResults[0].name, thumbnail: searchResults[0].thumbnail, status: item.my_status[0] });
                }
                else {
                    skippedCount++;
                }
            }
            catch {
                skippedCount++;
            }
        }
        try {
            await (0, sync_1.performWriteTransaction)(db, (tx) => {
                if (erase)
                    tx.run('DELETE FROM watchlist');
                const stmt = tx.prepare('INSERT OR REPLACE INTO watchlist (id, name, thumbnail, status) VALUES (?, ?, ?, ?)');
                showsToInsert.forEach(show => stmt.run(show.id, show.name, show.thumbnail, show.status));
                stmt.finalize();
            });
            res.json({ imported: showsToInsert.length, skipped: skippedCount });
        }
        catch (dbError) {
            logger_1.default.error({ err: dbError }, 'Import DB error');
            res.status(500).json({ error: 'DB error' });
        }
    });
});
async function getContinueWatchingData(db, provider) {
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
    const inProgressShows = await new Promise((resolve, reject) => {
        db.all(inProgressQuery, [], (err, rows) => {
            if (err)
                reject(err);
            else
                resolve(rows);
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
    const watchingShows = await new Promise((resolve, reject) => {
        db.all(watchingShowsQuery, [], (err, rows) => {
            if (err)
                reject(err);
            else
                resolve(rows);
        });
    });
    const upNextShows = [];
    const fullyWatchedShows = [];
    for (const show of watchingShows) {
        try {
            const [epDetails, watchedEpisodesResult] = await Promise.all([
                provider.getEpisodes(show.id, 'sub'),
                new Promise((resolve, reject) => {
                    db.all('SELECT * FROM watched_episodes WHERE showId = ?', [show.id], (err, rows) => {
                        if (err)
                            reject(err);
                        else
                            resolve(rows);
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
            }
            else if (watchedEpsMap.size > 0) {
                const lastWatchedEpisodeNumber = Math.max(...Array.from(watchedEpsMap.keys()).map(e => parseFloat(e)));
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
        }
        catch (e) {
            logger_1.default.error({ err: e, showId: show.id }, 'Error processing show for Up Next list');
        }
    }
    const combinedList = [];
    const seenShowIds = new Set();
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
    }
    catch {
        res.status(500).json({ error: 'DB error' });
    }
});
app.get('/api/continue-watching/all', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const { data: allData, total } = await getContinueWatchingData(req.db, provider);
        res.json({
            data: allData.slice(offset, offset + limit),
            total,
            page,
            limit
        });
    }
    catch {
        res.status(500).json({ error: 'DB error' });
    }
});
app.post('/api/update-progress', async (req, res) => {
    const { showId, episodeNumber, currentTime, duration, showName, showThumbnail, nativeName, englishName } = req.body;
    try {
        await (0, sync_1.performWriteTransaction)(req.db, (tx) => {
            tx.run('INSERT OR IGNORE INTO shows_meta (id, name, thumbnail, nativeName, englishName) VALUES (?, ?, ?, ?, ?)', [showId, showName, provider.deobfuscateUrl(showThumbnail), nativeName, englishName]);
            tx.run(`INSERT OR REPLACE INTO watched_episodes (showId, episodeNumber, watchedAt, currentTime, duration) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)`, [showId, episodeNumber, currentTime, duration]);
        });
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Update progress failed');
        res.status(500).json({ error: 'DB error' });
    }
});
app.post('/api/continue-watching/remove', async (req, res) => {
    const { showId } = req.body;
    try {
        await (0, sync_1.performWriteTransaction)(req.db, (tx) => {
            tx.run('DELETE FROM watched_episodes WHERE showId = ?', [showId]);
        });
        res.json({ success: true });
    }
    catch {
        res.status(500).json({ error: 'DB error' });
    }
});
app.get('/api/watchlist', (req, res) => {
    const { status, page: pageStr, limit: limitStr } = req.query;
    const page = parseInt(pageStr) || 1;
    const limit = parseInt(limitStr) || 10;
    const offset = (page - 1) * limit;
    let query = 'SELECT * FROM watchlist';
    let countQuery = 'SELECT COUNT(*) as total FROM watchlist';
    const params = [];
    if (status && status !== 'All') {
        query += ' WHERE status = ?';
        countQuery += ' WHERE status = ?';
        params.push(status);
    }
    query += ' ORDER BY rowid DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    req.db.all(query, params, (err, rows) => {
        if (err)
            return res.status(500).json({ error: 'DB error', details: err.message });
        req.db.get(countQuery, params.slice(0, -2), (countErr, countRow) => {
            if (countErr)
                return res.status(500).json({ error: 'DB error', details: countErr.message });
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
    req.db.get('SELECT EXISTS(SELECT 1 FROM watchlist WHERE id = ?) as inWatchlist', [req.params.showId], (err, row) => res.json({ inWatchlist: !!row.inWatchlist }));
});
app.get('/api/episode-progress/:showId/:episodeNumber', (req, res) => {
    req.db.get('SELECT currentTime, duration FROM watched_episodes WHERE showId = ? AND episodeNumber = ?', [req.params.showId, req.params.episodeNumber], (err, row) => res.json(row || { currentTime: 0, duration: 0 }));
});
app.get('/api/watched-episodes/:showId', (req, res) => {
    req.db.all(`SELECT episodeNumber FROM watched_episodes WHERE showId = ?`, [req.params.showId], (err, rows) => res.json(rows ? rows.map(r => r.episodeNumber) : []));
});
app.post('/api/watchlist/add', async (req, res) => {
    const { id, name, thumbnail, status, nativeName, englishName } = req.body;
    try {
        await (0, sync_1.performWriteTransaction)(req.db, (tx) => {
            tx.run('INSERT OR REPLACE INTO watchlist (id, name, thumbnail, status, nativeName, englishName) VALUES (?, ?, ?, ?, ?, ?)', [id, name, provider.deobfuscateUrl(thumbnail), status || 'Watching', nativeName, englishName]);
        });
        res.json({ success: true });
    }
    catch {
        res.status(500).json({ error: 'DB error' });
    }
});
app.post('/api/watchlist/remove', async (req, res) => {
    const { id } = req.body;
    try {
        await (0, sync_1.performWriteTransaction)(req.db, (tx) => {
            tx.run('DELETE FROM watchlist WHERE id = ?', [id]);
        });
        res.json({ success: true });
    }
    catch {
        res.status(500).json({ error: 'DB error' });
    }
});
app.post('/api/watchlist/status', async (req, res) => {
    const { id, status } = req.body;
    try {
        await (0, sync_1.performWriteTransaction)(req.db, (tx) => {
            tx.run('UPDATE watchlist SET status = ? WHERE id = ?', [status, id]);
        });
        res.json({ success: true });
    }
    catch {
        res.status(500).json({ error: 'DB error' });
    }
});
app.get('/api/settings', (req, res) => {
    req.db.get('SELECT value FROM settings WHERE key = ?', [req.query.key], (err, row) => res.json({ value: row ? row.value : null }));
});
app.post('/api/settings', async (req, res) => {
    try {
        await (0, sync_1.performWriteTransaction)(req.db, (tx) => {
            tx.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [req.body.key, req.body.value]);
        });
        res.json({ success: true });
    }
    catch {
        res.status(500).json({ error: 'DB error' });
    }
});
app.get('/api/backup-db', (_req, res) => {
    const dbName = config_1.CONFIG.IS_DEV ? config_1.CONFIG.DB_NAME_DEV : config_1.CONFIG.DB_NAME_PROD;
    const dbPath = path_1.default.join(config_1.CONFIG.ROOT, dbName);
    const backupPath = path_1.default.join(config_1.CONFIG.ROOT, 'ani-web-backup.db');
    fs_1.default.copyFile(dbPath, backupPath, (err) => {
        if (err)
            return res.status(500).json({ error: 'Backup failed' });
        res.download(backupPath, 'ani-web-backup.db', () => {
            fs_1.default.unlink(backupPath, () => { });
        });
    });
});
app.post('/api/restore-db', (0, multer_1.default)({ storage: multer_1.default.diskStorage({ destination: (_req, _f, cb) => cb(null, config_1.CONFIG.ROOT), filename: (_r, _f, cb) => cb(null, `restore_temp.db`) }) }).single('dbfile'), (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'No file uploaded.' });
    const dbName = config_1.CONFIG.IS_DEV ? config_1.CONFIG.DB_NAME_DEV : config_1.CONFIG.DB_NAME_PROD;
    const tempPath = path_1.default.join(config_1.CONFIG.ROOT, `restore_temp.db`);
    const dbPath = path_1.default.join(config_1.CONFIG.ROOT, dbName);
    db.close(err => {
        if (err)
            return res.status(500).json({ error: 'Failed to close database.' });
        fs_1.default.rename(tempPath, dbPath, err => {
            (0, sync_1.initializeDatabase)(dbPath).then(newDb => db = newDb);
            if (err)
                return res.status(500).json({ error: 'Failed to replace database file.' });
            res.json({ success: true, message: 'Database restored.' });
        });
    });
});
app.get('/api/subtitle-proxy', async (req, res) => {
    try {
        const response = await axios_1.default.get(req.query.url, { responseType: 'text', timeout: 10000 });
        res.set('Content-Type', 'text/vtt; charset=utf-8').send(response.data);
    }
    catch (e) {
        res.status(500).send('Proxy error');
    }
});
app.get('/api/image-proxy', async (req, res) => {
    const { url } = req.query;
    if (!url)
        return res.status(400).send('URL required');
    try {
        const imageResponse = await (0, axios_1.default)({ method: 'get', url: url, responseType: 'arraybuffer', headers: { Referer: 'https://allanime.day', 'User-Agent': 'Mozilla/5.0' } });
        res.set('Content-Type', imageResponse.headers['content-type']);
        res.set('Cache-Control', 'public, max-age=604800, immutable');
        res.send(imageResponse.data);
    }
    catch (e) {
        res.status(200).sendFile(path_1.default.join(__dirname, '..', 'public/placeholder.svg'));
    }
});
app.get('/api/video', async (req, res) => {
    try {
        res.json(await provider.getStreamUrls(req.query.showId, req.query.episodeNumber, req.query.mode));
    }
    catch {
        res.status(500).send('Error');
    }
});
app.get('/api/episodes', async (req, res) => {
    try {
        res.json(await provider.getEpisodes(req.query.showId, req.query.mode));
    }
    catch {
        res.status(500).send('Error');
    }
});
app.get('/api/search', async (req, res) => {
    try {
        res.json(await provider.search(req.query));
    }
    catch {
        res.status(500).send('Error');
    }
});
app.get('/api/seasonal', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        res.json(await provider.getSeasonal(page));
    }
    catch {
        res.status(500).send('Error');
    }
});
app.get('/api/latest-releases', async (req, res) => {
    try {
        res.json(await provider.getLatestReleases());
    }
    catch {
        res.status(500).send('Error');
    }
});
app.get('/api/show-meta/:id', async (req, res) => {
    try {
        res.json(await provider.getShowMeta(req.params.id));
    }
    catch {
        res.status(500).send('Error');
    }
});
app.get('/api/show-details/:id', async (req, res) => {
    try {
        res.json(await provider.getShowDetails(req.params.id));
    }
    catch {
        res.status(404).send('Not found');
    }
});
app.get('/api/allmanga-details/:id', async (req, res) => {
    try {
        res.json(await provider.getAllmangaDetails(req.params.id));
    }
    catch {
        res.status(500).send('Error');
    }
});
app.get('/api/genres-and-tags', (req, res) => res.json({ genres: constants_1.genres, tags: constants_1.tags, studios: constants_1.studios }));
if (!config_1.CONFIG.IS_DEV) {
    const frontendPath = path_1.default.resolve(__dirname, '../../client/dist');
    const indexHtml = path_1.default.join(frontendPath, 'index.html');
    logger_1.default.info(`Serving frontend from: ${frontendPath}`);
    app.use(express_1.default.static(frontendPath));
    app.get(/^(?!\/api).+/, (req, res) => {
        res.sendFile(indexHtml, (err) => {
            if (err) {
                logger_1.default.error({ err }, `Failed to serve index.html from ${indexHtml}`);
                if (!res.headersSent) {
                    res.status(500).send("Server Error: Frontend build not found.");
                }
            }
        });
    });
}
async function main() {
    const dbName = config_1.CONFIG.IS_DEV ? config_1.CONFIG.DB_NAME_DEV : config_1.CONFIG.DB_NAME_PROD;
    const dbPath = path_1.default.join(config_1.CONFIG.ROOT, dbName);
    const remoteFolder = config_1.CONFIG.IS_DEV ? config_1.CONFIG.REMOTE_FOLDER_DEV : config_1.CONFIG.REMOTE_FOLDER_PROD;
    if (config_1.CONFIG.IS_DEV && fs_1.default.existsSync(dbPath)) {
        try {
            fs_1.default.unlinkSync(dbPath);
        }
        catch { }
    }
    db = await (0, sync_1.initializeDatabase)(dbPath);
    logger_1.default.info(`Database initialized at ${dbPath}`);
    await runSyncSequence();
    const watcher = chokidar_1.default.watch(dbPath, { persistent: true, ignoreInitial: true });
    let debounceTimer;
    watcher.on('change', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => (0, sync_1.syncUp)(db, dbPath, remoteFolder), 15000);
    });
    const shutdown = async () => {
        if (isShuttingDown)
            return;
        isShuttingDown = true;
        console.log("\nServer shutting down. Syncing...");
        clearTimeout(debounceTimer);
        try {
            await (0, sync_1.syncUp)(db, dbPath, remoteFolder);
            console.log("Sync complete.");
        }
        catch (e) {
            console.error("Sync failed:", e);
        }
        db.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    app.listen(config_1.CONFIG.PORT, () => {
        logger_1.default.info(`Server running on http://localhost:${config_1.CONFIG.PORT}`);
    });
}
main().catch(err => {
    console.error("Server failed to start:", err);
    process.exit(1);
});
