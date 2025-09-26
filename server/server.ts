import express from 'express';
import { genres, tags, studios } from './constants';
import path from 'path';
import cors from 'cors';
import axios, { type AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import NodeCache from 'node-cache';
import crypto from 'crypto';
import fs from 'fs';
import { exec } from 'child_process';
import cheerio from 'cheerio';
import { parseString } from 'xml2js';
import sqlite3 from 'sqlite3';
import multer from 'multer';
import { syncDownOnBoot, syncUp, performWriteTransaction, verifyRclone } from './sync';
import chokidar from 'chokidar';

interface Show {
    _id: string;
    name: string;
    thumbnail?: string;
    description?: string;
    type?: string;
    availableEpisodesDetail?: {
        sub?: string[];
        dub?: string[];
    };
}

interface MalAnimeItem {
    series_title: string[];
    my_status: string[];
}

const app = express();
const apiCache = new NodeCache({ stdTTL: 3600 });

let db: sqlite3.Database;
const dbPath = path.join(__dirname, 'anime.db');

const dbUploadStorage = multer.diskStorage({
   destination: function (_req: Express.Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) {
      cb(null, __dirname);
   },
   filename: function (_req: Express.Request, _file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) {
      cb(null, 'anime.db.temp');
   }
});
const dbUpload = multer({ storage: dbUploadStorage });

interface TableInfoRow {
  cid: number;
  name: string;
  type: string;
  notnull: 0 | 1;
  dflt_value: string | null;
  pk: 0 | 1;
}

function initializeDatabase() {
   db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
         console.error('Database opening error: ', err.message);
      } else {

         db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS watchlist (id TEXT NOT NULL, name TEXT, thumbnail TEXT, status TEXT, PRIMARY KEY (id))`);
            db.run(`CREATE TABLE IF NOT EXISTS watched_episodes (showId TEXT NOT NULL, episodeNumber TEXT NOT NULL, watchedAt DATETIME DEFAULT CURRENT_TIMESTAMP, currentTime REAL DEFAULT 0, duration REAL DEFAULT 0, PRIMARY KEY (showId, episodeNumber))`);
            db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT NOT NULL, value TEXT, PRIMARY KEY (key))`);
            db.run(`CREATE TABLE IF NOT EXISTS shows_meta (id TEXT PRIMARY KEY, name TEXT, thumbnail TEXT)`);

            db.run(`CREATE TABLE IF NOT EXISTS sync_metadata (key TEXT PRIMARY KEY, value INTEGER)`);
            db.run(`INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('db_version', 1)`);

            db.all("PRAGMA table_info(watchlist)", (err, rows: TableInfoRow[]) => {
                if (err) { console.error("Error checking watchlist schema:", err); return; }
                const columns = rows.map(col => col.name);
                if (!columns.includes("nativeName")) {
                    db.run(`ALTER TABLE watchlist ADD COLUMN nativeName TEXT`);
                }
                if (!columns.includes("englishName")) {
                    db.run(`ALTER TABLE watchlist ADD COLUMN englishName TEXT`);
                }
            });

            db.all("PRAGMA table_info(shows_meta)", (err, rows: TableInfoRow[]) => {
                if (err) { console.error("Error checking shows_meta schema:", err); return; }
                const columns = rows.map(col => col.name);
                if (!columns.includes("nativeName")) {
                    db.run(`ALTER TABLE shows_meta ADD COLUMN nativeName TEXT`);
                }
                if (!columns.includes("englishName")) {
                    db.run(`ALTER TABLE shows_meta ADD COLUMN englishName TEXT`);
                }
            });
         });
      }
   });
}
axiosRetry(axios, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error: AxiosError) => {
        return axiosRetry.isNetworkError(error) || axiosRetry.isRetryableError(error);
    },
});

const port = 3000;

const apiBaseUrl = 'https://allanime.day';
const apiEndpoint = `https://api.allanime.day/api`;
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0';
const referer = 'https://allmanga.to';
const DEOBFUSCATION_MAP: { [key: string]: string } = {
    '79': 'A', '7a': 'B', '7b': 'C', '7c': 'D', '7d': 'E', '7e': 'F', '7f': 'G',
    '70': 'H', '71': 'I', '72': 'J', '73': 'K', '74': 'L', '75': 'M', '76': 'N',
    '77': 'O', '68': 'P', '69': 'Q', '6a': 'R', '6b': 'S', '6c': 'T', '6d': 'U',
    '6e': 'V', '6f': 'W', '60': 'X', '61': 'Y', '62': 'Z', '59': 'a', '5a': 'b',
    '5b': 'c', '5c': 'd', '5d': 'e', '5e': 'f', '5f': 'g', '50': 'h', '51': 'i',
    '52': 'j', '53': 'k', '54': 'l', '55': 'm', '56': 'n', '57': 'o', '48': 'p',
    '49': 'q', '4a': 'r', '4b': 's', '4c': 't', '4d': 'u', '4e': 'v', '4f': 'w',
    '40': 'x', '41': 'y', '42': 'z', '08': '0', '09': '1', '0a': '2', '0b': '3',
    '0c': '4', '0d': '5', '0e': '6', '0f': '7', '00': '8', '01': '9', '15': '-',
    '16': '.', '67': '_', '46': '~', '02': ':', '17': '/', '07': '?', '1b': '#',
    '63': '[', '65': ']', '78': '@', '19': '!', '1c': '$', '1e': '&', '10': '(',
    '11': ')', '12': '*', '13': '+', '14': ',', '03': ';', '05': '=', '1d': '%'
};
function deobfuscateUrl(obfuscatedUrl: string): string {
    if (!obfuscatedUrl) return '';
    let finalUrl = obfuscatedUrl;

    if (!obfuscatedUrl.startsWith('--') && obfuscatedUrl.includes('s4.anilist.co')) {
        finalUrl = obfuscatedUrl.replace('https://s4.anilist.co', 'https://wp.youtube-anime.com/s4.anilist.co');
    } else if (obfuscatedUrl.startsWith('--')) {
        obfuscatedUrl = obfuscatedUrl.slice(2);
        let deobfuscated = '';
        for (let i = 0; i < obfuscatedUrl.length; i += 2) {
            const chunk = obfuscatedUrl.substring(i, i + 2);
            deobfuscated += DEOBFUSCATION_MAP[chunk] || chunk;
        }
        if (deobfuscated.startsWith('/')) {
            finalUrl = `https://wp.youtube-anime.com${deobfuscated}`;
        } else {
            finalUrl = deobfuscated;
        }
    }

    if (finalUrl.startsWith('http://') || finalUrl.startsWith('https://')) {
        return `http://localhost:3000/api/image-proxy?url=${encodeURIComponent(finalUrl)}`;
    }

    return finalUrl;
}

function unpackPackedJs(packedJs: string): string {
    try {
        const payloadMatch = packedJs.match(/}\((.*)\)\)$/);
        if (!payloadMatch) return '';
        
        const payload = payloadMatch[1];
        const parts = payload.split(',').map(part => part.trim());

        if (parts.length < 4) return '';

        const p = parts[0].replace(/^'|'$/g, '');
        const a = parseInt(parts[1]);
        const c = parseInt(parts[2]);
        const k = parts[3].replace(/^'|'$/g, '').split('|');

        if (isNaN(a) || isNaN(c) || k.length !== c) return '';

        let unpacked = p;
        const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        
        const toBase = (n: number, base: number): string => {
            let result = '';
            while (n > 0) {
                result = alphabet[n % base] + result;
                n = Math.floor(n / base);
            }
            return result || '0';
        };

        for (let i = c - 1; i >= 0; i--) {
            const key = toBase(i, a);
            unpacked = unpacked.replace(new RegExp(`\\b${key}\\b`, 'g'), k[i] || key);
        }
        
        return unpacked;
    } catch (e) {
        console.error('Failed to unpack JS:', e);
        return '';
    }
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const showsQuery = `
query ($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) {
  shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) {
    edges {
      _id
      name
      nativeName
      englishName
      thumbnail
      description
      type
      availableEpisodesDetail
    }
  }
}
`;
async function fetchAndSendShows(res: express.Response, variables: Record<string, unknown>, cacheKey: string | null, extensions?: Record<string, unknown>) {
    if (cacheKey && apiCache.has(cacheKey)) {
        return res.json(apiCache.get(cacheKey));
    }
    try {
        const params: { [key: string]: string } = { variables: JSON.stringify(variables) };
        if (extensions) {
            params.extensions = JSON.stringify(extensions);
        } else {
            params.query = showsQuery;
        }

        const response = await axios.get(apiEndpoint, {
            headers: { 'User-Agent': userAgent, 'Referer': referer },
            params,
            timeout: 15000
        });
        const shows = response.data?.data?.shows?.edges || [];
        const transformedShows = shows.map((show: Show) => ({
            ...show,
            thumbnail: deobfuscateUrl(show.thumbnail || '')
        }));
        if (cacheKey) {
            apiCache.set(cacheKey, transformedShows);
        }
        res.set('Cache-Control', 'public, max-age=300');
        res.json(transformedShows);
    } catch (error) {
        const err = error as { message: string };
        console.error('Error fetching data:', err.message);
        res.status(500).send('Error fetching data');
    }
}


async function streamToString(stream: NodeJS.ReadableStream | null | undefined): Promise<string> {
    if (!stream || typeof stream.pipe !== 'function') return stream as unknown as string;
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
}

const popularQueryHash = "1fc9651b0d4c3b9dfd2fa6e1d50b8f4d11ce37f988c23b8ee20f82159f7c1147";
app.get('/api/popular/:timeframe', async (req, res) => {
    const timeframe = req.params.timeframe.toLowerCase();
    const cacheKey = `popular-${timeframe}`;
    if (apiCache.has(cacheKey)) {
        return res.json(apiCache.get(cacheKey));
    }
    let dateRange;
    switch (timeframe) {
        case 'daily': dateRange = 1; break;
        case 'weekly': dateRange = 7; break;
        case 'monthly': dateRange = 30; break;
        case 'all': dateRange = 0; break;
        default: return res.status(400).send('Invalid timeframe.');
    }
    const variables = { type: "anime", size: 10, page: 1, allowAdult: false, allowUnknown: false, dateRange: dateRange };
    const extensions = { persistedQuery: { version: 1, sha256Hash: popularQueryHash } };
    try {
        const response = await axios.get(apiEndpoint, {
            headers: { 'User-Agent': userAgent, 'Referer': referer },
            params: { variables: JSON.stringify(variables), extensions: JSON.stringify(extensions) },
            timeout: 15000
        });
        const recommendations = response.data?.data?.queryPopular?.recommendations || [];
        const shows = recommendations.map((rec: { anyCard: Show }) => {
            const card = rec.anyCard;
            return { ...card, thumbnail: deobfuscateUrl(card.thumbnail || '') };
        });
        apiCache.set(cacheKey, shows);
        res.set('Cache-Control', 'public, max-age=300');
        res.json(shows);
    } catch (error) {
        const err = error as { response?: { data: unknown }, message: string };
        console.error('Error fetching popular data:', err.response ? err.response.data : err.message);
        res.status(500).send('Error fetching popular data');
    }
});

app.get('/api/schedule/:date', (req, res) => {
    const dateStr = req.params.date;
    const cacheKey = `schedule-${dateStr}`;
    if (apiCache.has(cacheKey)) {
        return res.json(apiCache.get(cacheKey));
    }
    const requestedDate = new Date(dateStr + 'T00:00:00.000Z');
    if (isNaN(requestedDate.getTime())) {
        return res.status(400).send('Invalid date format. Use YYYY-MM-DD.');
    }
    const startOfDay = new Date(requestedDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(requestedDate);
    endOfDay.setUTCHours(23, 59, 59, 999);
    const variables = { search: { dateRangeStart: Math.floor(startOfDay.getTime() / 1000), dateRangeEnd: Math.floor(endOfDay.getTime() / 1000), sortBy: "Latest_Update" }, limit: 50, page: 1, translationType: "sub", countryOrigin: "ALL" };
    fetchAndSendShows(res, variables, cacheKey);
});

app.get('/api/proxy', async (req, res) => {
    const _requestId = crypto.randomBytes(4).toString('hex');
    const { url, referer: dynamicReferer } = req.query;

    try {
        const headers: Record<string, string> = {
            'User-Agent': userAgent,
            'Accept': '*/*',
            'Connection': 'keep-alive'
        };
        if (dynamicReferer) headers['Referer'] = dynamicReferer as string;

        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        if ((url as string).includes('.m3u8')) {
            const response = await axios.get(url as string, { headers, responseType: 'text', timeout: 15000 });
            
            const baseUrl = new URL(url as string);
            const rewritten = response.data.split('\n').map((l: string) =>
                (l.trim().length > 0 && !l.startsWith('#'))
                    ? `/api/proxy?url=${encodeURIComponent(new URL(l, baseUrl).href)}&referer=${encodeURIComponent(dynamicReferer as string || referer)}`
                    : l
            ).join('\n');
            res.set('Content-Type', 'application/vnd.apple.mpegurl').send(rewritten);
        } else {
            const streamResponse = await axios({
                method: 'get',
                url: url as string,
                responseType: 'stream',
                headers,
                timeout: 20000
            });

            res.status(streamResponse.status);
            for (const key in streamResponse.headers) {
                res.set(key, streamResponse.headers[key] as string);
            }

            req.on('close', () => {
                streamResponse.data.destroy();
            });

            streamResponse.data.pipe(res);
            streamResponse.data.on('error', (err: Error & { code?: string }) => {

                if (err.code !== 'ECONNRESET') {
                    // Other stream errors are not specifically handled, but we will still close the response.
                }

                if (!res.headersSent) {
                    res.status(500).send('Error during streaming from remote.');
                }
                res.end();
            });

            streamResponse.data.on('end', () => {
                // No action needed on stream end, but the handler is present for potential future use.
            });
        }
    } catch (e) {
        const err = e as { response?: { data: NodeJS.ReadableStream, status: number }, request?: unknown, message: string };
        if (err.response) {
            const _errorBody = await streamToString(err.response.data).catch(() => 'Could not read error stream.');
            if (!res.headersSent) res.status(err.response.status).send(`Proxy error: ${err.message}`);
        } else if (err.request) {
            if (!res.headersSent) res.status(504).send(`Proxy error: Gateway timeout.`);
        } else {
            if (!res.headersSent) res.status(500).send(`Proxy error: ${err.message}`);
        }
        if (res.headersSent && res.writable) {
           res.end();
        }
    }
});

app.get('/api/skip-times/:showId/:episodeNumber', async (req, res) => {
    const { showId, episodeNumber } = req.params;
    const cacheKey = `skip-${showId}-${episodeNumber}`;
    const notFoundResponse = { found: false, results: [] };

    if (apiCache.has(cacheKey)) {
        return res.json(apiCache.get(cacheKey));
    }

    try {
        const malIdQuery = `query($showId: String!) { show(_id: $showId) { malId } }`;
        const malIdResponse = await axios.get(apiEndpoint, {
            headers: { 'User-Agent': userAgent, 'Referer': referer },
            params: { query: malIdQuery, variables: JSON.stringify({ showId }) },
            timeout: 10000
        });

        const malId = malIdResponse.data?.data?.show?.malId;

        if (!malId) {
            apiCache.set(cacheKey, notFoundResponse);
            return res.json(notFoundResponse);
        }

        const response = await axios.get(`https://api.aniskip.com/v1/skip-times/${malId}/${episodeNumber}?types=op&types=ed`, {
            headers: { 'User-Agent': userAgent },
            timeout: 5000
        });

        apiCache.set(cacheKey, response.data);
        res.json(response.data);
    } catch (_error) {
        apiCache.set(cacheKey, notFoundResponse);
        res.json(notFoundResponse);
    }
});

app.post('/api/import/mal-xml', async (req, res) => {
    const { xml, erase } = req.body;
    if (!xml) {
        return res.status(400).json({ error: 'XML content is required' });
    }

    parseString(xml, async (err: Error | null, result: { myanimelist: { anime: MalAnimeItem[] } }) => {
        if (err || !result || !result.myanimelist || !result.myanimelist.anime) {
            return res.status(400).json({ error: 'Invalid or empty MyAnimeList XML file.' });
        }
        
        const animeList = result.myanimelist.anime;
        let skippedCount = 0;
        const showsToInsert: { id: string; name: string; thumbnail: string; status: string; }[] = [];

        for (const item of animeList) {
            try {
                const title = item.series_title[0];
                const malStatus = item.my_status[0];
                const searchResponse = await axios.get(apiEndpoint, {
                    headers: { 'User-Agent': userAgent, 'Referer': referer },
                    params: { query: showsQuery, variables: JSON.stringify({ search: { query: title }, limit: 1 }) },
                    timeout: 5000
                });
                const foundShow = searchResponse.data?.data?.shows?.edges[0];
                if (foundShow) {
                    showsToInsert.push({
                        id: foundShow._id,
                        name: foundShow.name,
                        thumbnail: deobfuscateUrl(foundShow.thumbnail),
                        status: malStatus
                    });
                } else {
                    skippedCount++;
                }
            } catch (_searchError) {
                skippedCount++;
            }
        }

        try {
            if (erase || showsToInsert.length > 0) {
                await performWriteTransaction(db, (tx) => {
                    if (erase) {
                        tx.run(`DELETE FROM watchlist`);
                    }
                    if (showsToInsert.length > 0) {
                        const stmt = tx.prepare(`INSERT OR REPLACE INTO watchlist (id, name, thumbnail, status) VALUES (?, ?, ?, ?)`);
                        for (const show of showsToInsert) {
                            stmt.run(show.id, show.name, show.thumbnail, show.status);
                        }
                        stmt.finalize();
                    }
                });
            }
            res.json({ imported: showsToInsert.length, skipped: skippedCount });
        } catch (dbError) {
            console.error('DB error on MAL import:', dbError);
            res.status(500).json({ error: 'DB error on MAL import' });
        }
    });
});

app.get('/api/allmanga-details/:id', async (req, res) => {
    const animeId = req.params.id;
    const url = `https://allmanga.to/bangumi/${animeId}`;

    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
        "Referer": "https://allmanga.to"
    };

    try {
        const response = await axios.get(url, { headers });
        const $ = cheerio.load(response.data);

        const details: { [key: string]: string } = {
            "Rating": "N/A",
            "Season": "N/A",
            "Episodes": "N/A",
            "Date": "N/A",
            "Original Broadcast": "N/A"
        };

        $('.info-season').each((_i, elem) => {
            const label = $(elem).find('h4').text().trim();
            const value = $(elem).find('li').text().trim();
            if (Object.prototype.hasOwnProperty.call(details, label)) {
                details[label] = value;
            }
        });
        
        res.json(details);

    } catch (error) {
        const err = error as { message: string };
        console.error(`Error fetching allmanga details for ${animeId}:`, err.message);
        res.status(500).json({ error: "Failed to fetch allmanga details" });
    }
});

app.get('/api/show-details/:id', async (req, res) => {
    const showId = req.params.id;
    const cacheKey = `show-details-${showId}`;
    if (apiCache.has(cacheKey)) {
        return res.json(apiCache.get(cacheKey));
    }

    try {
        const metaQuery = `query($showId: String!) { show(_id: $showId) { name } }`;
        const metaResponse = await axios.get(apiEndpoint, {
            headers: { 'User-Agent': userAgent, 'Referer': referer },
            params: { query: metaQuery, variables: JSON.stringify({ showId }) },
            timeout: 10000
        });
        const showName = metaResponse.data?.data?.show?.name;

        if (!showName) {
            return res.status(404).json({ error: 'Show not found' });
        }

        const scheduleSearchUrl = `https://animeschedule.net/api/v3/anime?q=${encodeURIComponent(showName)}`;
        const scheduleResponse = await axios.get(scheduleSearchUrl, { timeout: 10000 });
        
        const firstResult = scheduleResponse.data?.anime?.[0];
        
        if (firstResult) {
            if (firstResult.status === 'Ongoing') {
                try {
                    const pageResponse = await axios.get(`https://animeschedule.net/anime/${firstResult.route}`, { timeout: 10000 });
                    const countdownMatch = pageResponse.data.match(/countdown-time" datetime="([^"]*)"/);
                    if (countdownMatch) {
                        firstResult.nextEpisodeAirDate = countdownMatch[1];
                    }
                } catch (_e) {
                    console.error('Failed to scrape for nextEpisodeAirDate', (_e as Error).message);
                }
            }

            apiCache.set(cacheKey, firstResult, 3600);
            return res.json(firstResult);
        }

        return res.status(404).json({ error: "Not Found on Schedule" });

    } catch (_error) {
        return res.status(500).json({ error: "Error fetching show details" });
    }
});

app.get('/api/continue-watching', (_req, res) => {
    const query = `
        SELECT sm.id as showId, sm.name, sm.thumbnail, sm.nativeName, sm.englishName, we.episodeNumber, we.currentTime, we.duration
        FROM shows_meta sm
        JOIN (
           SELECT showId, episodeNumber, currentTime, duration, MAX(watchedAt) as watchedAt
           FROM watched_episodes
           GROUP BY showId
        ) we ON sm.id = we.showId
        ORDER BY we.watchedAt DESC
        LIMIT 10;
    `;
    db.all(query, [], async (err: Error | null, rows: { showId: string, name: string, thumbnail: string, episodeNumber: string, currentTime: number, duration: number }[]) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        try {
            const results = await Promise.all(rows.map(async (show) => {
                const isComplete = show.duration > 0 && show.currentTime / show.duration >= 0.95;
                if (!isComplete && show.currentTime > 0) {
                    return {
                        ...show,
                        thumbnail: deobfuscateUrl(show.thumbnail),
                        episodeToPlay: show.episodeNumber
                    };
                } else {
                     const epResponse = await axios.get(apiEndpoint, {
                        headers: { 'User-Agent': userAgent, 'Referer': referer },
                        params: { query: `query($showId: String!) { show(_id: $showId) { availableEpisodesDetail } }`, variables: JSON.stringify({ showId: show.showId }) },
                        timeout: 10000
                    });
                    const allEps = epResponse.data.data.show.availableEpisodesDetail.sub?.sort((a: string, b: string) => parseFloat(a) - parseFloat(b)) || [];
                    const lastWatchedIndex = allEps.indexOf(show.episodeNumber);

                    if (lastWatchedIndex > -1 && lastWatchedIndex < allEps.length) {
                        return {
                            ...show,
                            thumbnail: deobfuscateUrl(show.thumbnail),
                            episodeToPlay: allEps[lastWatchedIndex],
                            currentTime: 0,
                            duration: 0
                        };
                    }
                    return null;
                }
            }));
            res.json(results.filter(Boolean));
        } catch (apiError) {
            const err = apiError as { message: string };
            console.error("API Error in /continue-watching", err);
            res.status(500).json({ error: 'API error while resolving next episodes' });
        }
    });
});

app.post('/api/update-progress', async (req, res) => {
    const { showId, episodeNumber, currentTime, duration, showName, showThumbnail, nativeName, englishName } = req.body;

    try {
        await performWriteTransaction(db, (tx) => {
            tx.run('INSERT OR IGNORE INTO shows_meta (id, name, thumbnail, nativeName, englishName) VALUES (?, ?, ?, ?, ?)',
                [showId, showName, deobfuscateUrl(showThumbnail), nativeName, englishName]);

            tx.run(`INSERT OR REPLACE INTO watched_episodes (showId, episodeNumber, watchedAt, currentTime, duration) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)`,
                [showId, episodeNumber, currentTime, duration]);
        });
        res.json({ success: true });
    } catch (error) {
        console.error('DB error on progress update:', error);
        res.status(500).json({ error: 'DB error on progress update' });
    }
});
app.get('/api/episode-progress/:showId/:episodeNumber', (req, res) => {
    const { showId, episodeNumber } = req.params;

    db.get('SELECT currentTime, duration FROM watched_episodes WHERE showId = ? AND episodeNumber = ?',
        [showId, episodeNumber], (err: Error | null, row: { currentTime: number, duration: number }) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json(row || { currentTime: 0, duration: 0 });
    });
});

app.get('/api/watched-episodes/:showId', (req, res) => {
    db.all(`SELECT episodeNumber FROM watched_episodes WHERE showId = ?`,
        [req.params.showId], 
        (err: Error | null, rows: { episodeNumber: string }[]) => err ? res.status(500).json({ error: 'DB error' }) : res.json(rows.map(r => r.episodeNumber))
    );
});

app.post('/api/continue-watching/remove', async (req, res) => {
    const { showId } = req.body;
    try {
        await performWriteTransaction(db, (tx) => {
            tx.run(`DELETE FROM watched_episodes WHERE showId = ?`, [showId]);
        });
        res.json({ success: true });
    } catch (error) {
        console.error('DB error on continue-watching remove:', error);
        res.status(500).json({ error: 'DB error' });
    }
});

app.post('/api/watchlist/add', async (req, res) => {
    const { id, name, thumbnail, status, nativeName, englishName } = req.body;
    const finalThumbnail = deobfuscateUrl(thumbnail || '');
    try {
        await performWriteTransaction(db, (tx) => {
            tx.run(`INSERT OR REPLACE INTO watchlist (id, name, thumbnail, status, nativeName, englishName) VALUES (?, ?, ?, ?, ?, ?)`, 
                [id, name, finalThumbnail, status || 'Watching', nativeName, englishName]);
        });
        res.json({ success: true });
    } catch (error) {
        console.error('DB error on watchlist add:', error);
        res.status(500).json({ error: 'DB error' });
    }
});

app.get('/api/watchlist/check/:showId', (req, res) => {
    db.get('SELECT EXISTS(SELECT 1 FROM watchlist WHERE id = ?) as inWatchlist',
        [req.params.showId],
        (err: Error | null, row: { inWatchlist: number }) => err ? res.status(500).json({ error: 'DB error' }) : res.json({ inWatchlist: !!row.inWatchlist })
    );
});

app.post('/api/watchlist/status', async (req, res) => {
    const { id, status } = req.body;
    try {
        await performWriteTransaction(db, (tx) => {
            tx.run(`UPDATE watchlist SET status = ? WHERE id = ?`, [status, id]);
        });
        res.json({ success: true });
    } catch (error) {
        console.error('DB error on watchlist status update:', error);
        res.status(500).json({ error: 'DB error' });
    }
});

app.get('/api/watchlist', (req, res) => {
    const sort = req.query.sort || 'last_added';
    let orderByClause;

    switch (sort) {
        case 'name_asc':
            orderByClause = 'ORDER BY name ASC';
            break;
        case 'name_desc':
            orderByClause = 'ORDER BY name DESC';
            break;
        case 'last_added':
        default:
            orderByClause = 'ORDER BY ROWID DESC';
            break;
    }

    db.all(`SELECT id, name, thumbnail, status, nativeName, englishName FROM watchlist ${orderByClause}`, [],
        (err: Error | null, rows: Show[]) => err ? res.status(500).json({ error: 'DB error' }) : res.json(rows)
    );
});

app.get('/api/watchlist/backfill-names', async (_req, res) => {
    db.all(`SELECT id, name FROM watchlist`, [], async (err: Error | null, rows: { id: string, name: string }[]) => {
        if (err) return res.status(500).json({ error: 'DB error' });

        let updatedCount = 0;
        for (const item of rows) {
            try {
                const response = await axios.get(apiEndpoint, {
                    headers: { 'User-Agent': userAgent, 'Referer': referer },
                    params: { query: `query($showId: String!) { show(_id: $showId) { nativeName, englishName } }`, variables: JSON.stringify({ showId: item.id }) },
                    timeout: 10000
                });
                const show = response.data?.data?.show;
                if (show && (show.nativeName || show.englishName)) {
                    await new Promise<void>((resolve, reject) => {
                        db.run(`UPDATE watchlist SET nativeName = ?, englishName = ? WHERE id = ?`, 
                            [show.nativeName || null, show.englishName || null, item.id],
                            (updateErr: Error | null) => { 
                                if (updateErr) reject(updateErr); 
                                else { updatedCount++; resolve(); } 
                            }
                        );
                    });
                }
            } catch (apiError) {
                console.error(`Error backfilling names for watchlist item ${item.id}:`, (apiError as Error).message);
            }
        }
        res.json({ success: true, updatedCount });
    });
});

app.post('/api/watchlist/remove', async (req, res) => {
    const { id } = req.body;
    try {
        await performWriteTransaction(db, (tx) => {
            tx.run(`DELETE FROM watchlist WHERE id = ?`, [id]);
        });
        res.json({ success: true });
    } catch (error) {
        console.error('DB error on watchlist remove:', error);
        res.status(500).json({ error: 'DB error' });
    }
});

app.get('/api/settings/preferredSource', (req, res) => {
    db.get('SELECT value FROM settings WHERE key = ?', ['preferredSource'], (err: Error | null, row: { value: string } | undefined) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ value: row ? row.value : null });
    });
});

app.get('/api/settings', (req, res) => {
    const key = req.query.key as string;
    if (!key) {
        return res.status(400).json({ error: 'Key parameter is required.' });
    }
    db.get('SELECT value FROM settings WHERE key = ?', [key], (err: Error | null, row: { value: string } | undefined) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ value: row ? row.value : null });
    });
});

app.post('/api/settings', async (req, res) => {
    const { key, value } = req.body;
    try {
        await performWriteTransaction(db, (tx) => {
            tx.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
        });
        res.json({ success: true });
    } catch (error) {
        console.error('DB error on settings update:', error);
        res.status(500).json({ error: 'DB error' });
    }
});

app.get('/api/backup-db', (_req, res) => {
   res.download(dbPath, 'ani-web-backup.db', (err: Error | null) => {
      if (err) {
         console.error("Error sending database file:", err);
         res.status(500).send("Could not backup database.");
      }
   });
});

app.post('/api/restore-db', dbUpload.single('dbfile'), (req, res) => {
   if (!req.file) {
      return res.status(400).json({ error: 'No database file uploaded.' });
   }
   const tempPath = path.join(__dirname, 'anime.db.temp');
   db.close((err: Error | null) => {
      if (err) {
         console.error('Failed to close database for restore:', err.message);
         return res.status(500).json({ error: 'Failed to close current database.' });
      }
      fs.rename(tempPath, dbPath, (err: NodeJS.ErrnoException | null) => {
         if (err) {
            console.error('Failed to replace database file:', err.message);
            initializeDatabase();
            return res.status(500).json({ error: 'Failed to replace database file.' });
         }
         initializeDatabase();
         res.json({ success: true, message: 'Database restored successfully. The application will now refresh.' });
      });
   });
});





app.get('/api/subtitle-proxy', async (req, res) => {
    try {
        const response = await axios.get(req.query.url as string, { responseType: 'text', timeout: 10000 });
        res.set('Content-Type', 'text/vtt; charset=utf-8').send(response.data);
    } catch (error) {
        const err = error as { message: string };
        res.status(500).send(`Proxy error: ${err.message}`);
    }
});


app.get('/api/image-proxy', async (req, res) => {
    try {
        const axiosConfig: import('axios').AxiosRequestConfig = {
            method: 'get',
            url: req.query.url as string,
            responseType: 'stream',
            headers: { Referer: apiBaseUrl, 'User-Agent': userAgent },
            timeout: 10000,
            maxRedirects: 5
        };

        const { data: streamData, headers: originalHeaders } = await axios(axiosConfig);

        const contentType = originalHeaders['content-type'] && typeof originalHeaders['content-type'] === 'string'
            ? originalHeaders['content-type']
            : (function() {
                const url = req.query.url as string;
                const extensionMatch = url.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
                if (extensionMatch && extensionMatch[1]) {
                    const ext = extensionMatch[1].toLowerCase();
                    switch (ext) {
                        case 'png': return 'image/png';
                        case 'jpg':
                        case 'jpeg': return 'image/jpeg';
                        case 'webp': return 'image/webp';
                        case 'gif': return 'image/gif';
                        default: return 'image/webp';
                    }
                }
                return 'image/webp';
            })();

        res.set('Cache-Control', 'public, max-age=604800, immutable');
        res.set('Content-Type', contentType);

        streamData.pipe(res);

        streamData.on('error', (err: Error) => {
            console.error('Image proxy stream error (source):', err.message);
            if (!res.headersSent) {
                res.status(500).send('Error streaming image.');
            } else {
                res.end();
            }
        });

        res.on('close', () => {
            streamData.destroy();
        });

        res.on('error', (err: Error) => {
            console.error('Image proxy stream error (response):', err.message);
            streamData.destroy();
        });

    } catch (e) {
        const err = e as { message: string };
        console.error('Image proxy error:', err.message);
        res.status(200).sendFile(path.join(__dirname, '..','public/placeholder.svg'));
    }
});

function getCurrentAnimeSeason() {
	const month = new Date().getMonth();
	if (month >= 0 && month <= 2) return "Winter";
	if (month >= 3 && month <= 5) return "Spring";
	if (month >= 6 && month <= 8) return "Summer";
	return "Fall";
}

app.get('/api/video', async (req, res) => {
    const { showId, episodeNumber, mode = 'sub' } = req.query;
    const cacheKey = `video-${showId}-${episodeNumber}-${mode}`;

    if (apiCache.has(cacheKey)) {
        return res.json(apiCache.get(cacheKey));
    }

    const graphqlQuery = `query($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode(showId: $showId, translationType: $translationType, episodeString: $episodeString) { sourceUrls } }`;
    try {
        const { data } = await axios.get(apiEndpoint, {
            headers: { 'User-Agent': userAgent, 'Referer': referer },
            params: { query: graphqlQuery, variables: JSON.stringify({ showId, translationType: mode, episodeString: episodeNumber }) },
            timeout: 15000
        });

        const sourceUrls = data.data.episode.sourceUrls;

        if (!Array.isArray(sourceUrls)) {
            console.error('[ERROR] sourceUrls is not an array. Aborting.');
            return res.status(404).send('No video sources found.');
        }
        
        const supportedSources = ['Yt-mp4', 'S-mp4', 'Luf-Mp4', 'wixmp', 'Default', 'Fm-Hls', 'Vg', 'Sw', 'Mp4', 'Ok'];
        
        const sources = sourceUrls
            .filter((s: { sourceName: string }) => supportedSources.includes(s.sourceName))
            .sort((a: { priority: number }, b: { priority: number }) => b.priority - a.priority);

        const sourcePromises = sources.map(async (source: { sourceName: string, sourceUrl: string, type: string }) => {
            try {
                switch(source.sourceName) {
                    case 'Yt-mp4':
                    case 'S-mp4':
                    case 'Luf-Mp4':
                    case 'wixmp':
                    case 'Default': { 
                        if (!source.sourceUrl.startsWith('--')) return null;

                        let videoLinks: { resolutionStr: string; link: string; hls: boolean; headers?: Record<string, string> }[] = [];
                        let subtitles: { language: string; url: string }[] = [];

                        const decryptedUrl = ((s: string) => {
                            const m = DEOBFUSCATION_MAP;
                            let d = '';
                            for (let i = 0; i < s.length; i += 2) d += m[s.substring(i, i + 2)] || s.substring(i, i + 2);
                            return d.includes('/clock') && !d.includes('.json') ? d.replace('/clock', '/clock.json') : d;
                        })(source.sourceUrl.substring(2)).replace(/([^:]\/)\/+/g, "$1");
        
                        if (decryptedUrl.includes('/clock.json')) {
                            const finalUrl = new URL(decryptedUrl, apiBaseUrl).href;
                            const { data: clockData } = await axios.get(finalUrl, { headers: { 'Referer': referer, 'User-Agent': userAgent }, timeout: 10000 });
                            if (clockData.links && clockData.links.length > 0) {
                                videoLinks = clockData.links[0].hls ? await (async (u: string, h: Record<string, string>) => {
                                    try {
                                        const { data: d } = await axios.get(u, { headers: h, timeout: 10000 });
                                        const l = d.split('\n'), q: { resolutionStr: string; link: string; hls: boolean; headers: Record<string, string> }[] = [];
                                        for (let i = 0; i < l.length; i++)
                                            if (l[i].startsWith('#EXT-X-STREAM-INF')) {
                                                const rM = l[i].match(/RESOLUTION=\d+x(\d+)/);
                                                q.push({ resolutionStr: rM ? `${rM[1]}p` : 'Auto', link: new URL(l[i + 1], u).href, hls: true, headers: h });
                                            } return q.length > 0 ? q : [{ resolutionStr: 'auto', link: u, hls: true, headers: h }];
                                    } catch (_e) { return []; }
                                })(clockData.links[0].link, clockData.links[0].headers) : clockData.links;
                                subtitles = clockData.links[0].subtitles || [];
                            }
                        } else if (decryptedUrl.includes('repackager.wixmp.com')) {
                            const urlTemplate = decryptedUrl.replace('repackager.wixmp.com/', '').replace(/\.urlset.*/, '');
                            const qualitiesMatch = decryptedUrl.match(/\/,s*([^/]*),\s*\/mp4/);
                        if (qualitiesMatch && qualitiesMatch[1]) {
                            const qualities = qualitiesMatch[1].split(',');
                            videoLinks = qualities.map(q => ({
                                resolutionStr: q,
                                link: urlTemplate.replace(/,s*[^/]*$/, q),
                                hls: false
                            })).sort((a,b) => parseInt(b.resolutionStr) - parseInt(a.resolutionStr));
                        }
                        } else {
                            let finalLink = decryptedUrl;
                            if (finalLink.startsWith('/')) {
                                finalLink = new URL(finalLink, apiBaseUrl).href;
                            }
                            videoLinks.push({ link: finalLink, resolutionStr: 'default', hls: finalLink.includes('.m3u8'), headers: { Referer: referer } });
                        }
                        
                        if (videoLinks.length > 0) {
                            return { sourceName: source.sourceName, links: videoLinks, subtitles, type: 'player' };
                        }
                        return null;
                    }
                    
                    case 'Fm-Hls': { 
                        const fmUrl = source.sourceUrl;
                        const { data: fmHtml } = await axios.get(fmUrl, { headers: { 'Referer': fmUrl, 'User-Agent': userAgent } });
                        const packedJsMatch = fmHtml.match(/eval\(function\(p,a,c,k,e,d\){.+?}/s);
                        if (packedJsMatch) {
                            const unpackedJs = unpackPackedJs(packedJsMatch[0]);
                            const m3u8UrlMatch = unpackedJs.match(/file:"(.*?m3u8.*?)"/);
                            if (m3u8UrlMatch && m3u8UrlMatch[1]) {
                                const videoLinks = [{ link: m3u8UrlMatch[1], resolutionStr: 'auto', hls: true, headers: { Referer: fmUrl } }];
                                return { sourceName: source.sourceName, links: videoLinks, subtitles: [], type: 'player' };
                            }
                        }
                        return null;
                    }

                    case 'Vg':
                    case 'Sw':
                    case 'Mp4':
                    case 'Ok': {
                        if (source.type === 'iframe') {
                            const videoLinks = [{
                                resolutionStr: 'iframe',
                                link: source.sourceUrl,
                                hls: false
                            }];
                            return { sourceName: source.sourceName, links: videoLinks, subtitles: [], type: 'iframe' };
                        }
                        return null;
                    }

                    default:
                        return null;
                }
            } catch (e) {
                const err = e as { message: string };
                console.error(`[ERROR] Failed to process source: '${source.sourceName}'. Reason: ${err.message}`);
                return null;
            }
        });

        const results = await Promise.allSettled(sourcePromises);
        const availableSources = results
            .map(result => result.status === 'fulfilled' ? result.value : null)
            .filter(Boolean);

        if (availableSources.length > 0) {
            apiCache.set(cacheKey, availableSources, 300);
            res.json(availableSources);
        } else {
            res.status(404).send('No playable video URLs found.');
        }
    } catch (e) {
        const err = e as { message: string };
        console.error(`[FATAL ERROR] An error occurred while fetching video data for showId: ${showId}. Error: ${err.message}`);
        res.status(500).send(`Error fetching video data: ${err.message}`);
    }
});

app.get('/api/episodes', async (req, res) => {
    const { showId, mode = 'sub' } = req.query;
    const cacheKey = `episodes-${showId}-${mode}`;
    if (apiCache.has(cacheKey)) {
        return res.json(apiCache.get(cacheKey));
    }
    try {
        const response = await axios.get(apiEndpoint, {
            headers: { 'User-Agent': userAgent, 'Referer': referer },
            params: { query: `query($showId: String!) { show(_id: $showId) { availableEpisodesDetail, description } }`, variables: JSON.stringify({ showId }) },
            timeout: 15000
        });
        const showData = response.data.data.show;
        const result = { episodes: showData.availableEpisodesDetail[mode as string] as string[] || [], description: showData.description };
        apiCache.set(cacheKey, result);
        res.set('Cache-Control', 'public, max-age=300');
        res.json(result);
    } catch (_error) {
        res.status(500).send('Error fetching episodes from API');
    }
});

app.get('/api/search', (req, res) => {
    const { query, season, year, sortBy, page, type, country, translation, genres, excludeGenres, tags, excludeTags, studios } = req.query;
    const searchObj: { [key: string]: unknown } = { allowAdult: false };
    if (query) searchObj.query = query;
    if (season && season !== 'ALL') searchObj.season = season;
    if (year && year !== 'ALL') searchObj.year = parseInt(year as string);
    if (sortBy) searchObj.sortBy = sortBy;
    if (type && type !== 'ALL') searchObj.types = [type];
    if (genres) searchObj.genres = (genres as string).split(',');
    if (excludeGenres) searchObj.excludeGenres = (excludeGenres as string).split(',');
    if (tags) searchObj.tags = (tags as string).split(',');
    if (studios) searchObj.studios = (studios as string).split(',');
    if (excludeTags) searchObj.excludeTags = (excludeTags as string).split(',');

    const variables = { search: searchObj, limit: 28, page: parseInt(page as string) || 1, translationType: (translation && translation !== 'ALL') ? translation : 'sub', countryOrigin: (country && country !== 'ALL') ? country : 'ALL' };
    const extensions = {
        persistedQuery: {
            version: 1,
            sha256Hash: "06327bc10dd682e1ee7e07b6db9c16e9ad2fd56c1b769e47513128cd5c9fc77a"
        }
    };

    fetchAndSendShows(res, variables, null, extensions);
});

app.get('/api/seasonal', (req, res) => {
	const season = getCurrentAnimeSeason();
	const year = new Date().getFullYear();
    const page = parseInt(req.query.page as string) || 1;
	const variables = { search: { year, season, sortBy: "Latest_Update", allowAdult: false }, limit: 25, page: page, translationType: "sub", countryOrigin: "JP" };
    const cacheKey = `seasonal-${season}-${year}-p${page}`;
	fetchAndSendShows(res, variables, cacheKey);
});

app.get('/api/latest-releases', (_req, res) => {
    const variables = { search: { sortBy: 'Latest_Update', allowAdult: false }, limit: 10, page: 1, translationType: 'sub', countryOrigin: 'JP' };
    const cacheKey = 'latest-releases';
    fetchAndSendShows(res, variables, cacheKey);
});

app.get('/api/show-meta/:id', async (req, res) => {
    const showId = req.params.id;
    const cacheKey = `show-meta-${showId}`;
    if (apiCache.has(cacheKey)) {
        return res.json(apiCache.get(cacheKey));
    }
    try {
        const response = await axios.get(apiEndpoint, {
            headers: { 'User-Agent': userAgent, 'Referer': referer },
            params: { query: `query($showId: String!) { show(_id: $showId) { name, thumbnail, nativeName, englishName } }`, variables: JSON.stringify({ showId }) },
            timeout: 15000
        });
        const show = response.data.data.show;
        if (show) {
            const meta = { name: show.name, thumbnail: deobfuscateUrl(show.thumbnail), nativeName: show.nativeName, englishName: show.englishName };
            apiCache.set(cacheKey, meta);
            res.set('Cache-Control', 'public, max-age=300');
            res.json(meta);
        } else {
            res.status(404).json({ error: 'Show not found' });
        }
    } catch (_error) {
        res.status(500).json({ error: 'Failed to fetch show metadata' });
    }
});

app.use(express.static(path.join(__dirname, '../dist')));

app.get(/^(?!\/api).*$/, (_req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.get('/api/genres-and-tags', async (_req, res) => {
    res.json({ genres, tags, studios });
});

// --- CONFIGURATION ---
const RCLONE_REMOTE_DIR = 'aniweb_db'; // The remote directory on Google Drive

async function main() {
    const isSyncEnabled = await verifyRclone();

    if (isSyncEnabled) {
        await syncDownOnBoot(dbPath, RCLONE_REMOTE_DIR);
    }

    initializeDatabase();
    console.log('Database initialized.');

    if (isSyncEnabled) {
        const watcher = chokidar.watch(dbPath, { persistent: true, ignoreInitial: true });
        let debounceTimer: NodeJS.Timeout;
        watcher.on('change', () => {
            console.log(`[Sync] ${new Date().toISOString()} - Change detected in ${dbPath}. Resetting debounce timer (15s).`);
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                console.log(`[Sync] ${new Date().toISOString()} - Debounce timer elapsed. Initiating sync...`);
                syncUp(db, dbPath, RCLONE_REMOTE_DIR);
            }, 15000);
        });
        console.log(`[Sync] Watching ${dbPath} for changes...`);

        process.on('SIGINT', async () => {
            console.log('\n[Sync] Shutdown detected. Performing final sync...');
            clearTimeout(debounceTimer);
            await syncUp(db, dbPath, RCLONE_REMOTE_DIR);
            db.close((err) => {
                if (err) console.error('[Sync] Error closing database:', err.message);
                console.log('[Sync] Database connection closed. Exiting.');
                process.exit(0);
            });
        });
    }

    app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
    });
}

main().catch(err => {
    console.error("Failed to start server:", err);
    process.exit(1);
});