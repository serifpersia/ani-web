const express = require('express');
const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const sqlite3 = require('sqlite3').verbose();
const { parseString } = require('xml2js');
const { exec } = require('child_process');
const NodeCache = require('node-cache');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const port = 3000;
const apiCache = new NodeCache({ stdTTL: 3600 });
const dbPath = path.join(__dirname, 'anime.db');
let db;

axiosRetry(axios, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {

        return axiosRetry.isNetworkError(error) || axiosRetry.isRetryableError(error);
    },
});

const profilePicsDir = path.join(__dirname, '..', 'public', 'profile_pics');
if (!fs.existsSync(profilePicsDir)) {
    fs.mkdirSync(profilePicsDir, { recursive: true });
}

function initializeDatabase() {
   db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
         console.error('Database opening error: ', err.message);
      } else {
         console.log('Connected to SQLite database.');
         db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, picture_path TEXT)`);
            db.get(`SELECT COUNT(*) as count FROM profiles`, (err, row) => {
               if (row && row.count === 0) {
                  db.run(`INSERT INTO profiles (name) VALUES ('Default')`, (err) => {
                     if (!err) console.log('Created default profile.');
                  });
               }
            });
            db.run(`CREATE TABLE IF NOT EXISTS watchlist (profile_id INTEGER NOT NULL, id TEXT NOT NULL, name TEXT, thumbnail TEXT, status TEXT, PRIMARY KEY (profile_id, id))`);
            db.run(`CREATE TABLE IF NOT EXISTS watched_episodes (profile_id INTEGER NOT NULL, showId TEXT NOT NULL, episodeNumber TEXT NOT NULL, watchedAt DATETIME DEFAULT CURRENT_TIMESTAMP, currentTime REAL DEFAULT 0, duration REAL DEFAULT 0, PRIMARY KEY (profile_id, showId, episodeNumber))`);
            db.run(`CREATE TABLE IF NOT EXISTS settings (profile_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT, PRIMARY KEY (profile_id, key))`);
            db.run(`CREATE TABLE IF NOT EXISTS shows_meta (id TEXT PRIMARY KEY, name TEXT, thumbnail TEXT)`);
         });
      }
   });
}
initializeDatabase();

const profilePicStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, profilePicsDir);
    },
    filename: function (req, file, cb) {
        const profileId = req.params.id;
        const extension = path.extname(file.originalname);
        cb(null, `${profileId}${extension}`);
    }
});
const profilePicUpload = multer({ storage: profilePicStorage });

const dbUploadStorage = multer.diskStorage({
   destination: function (req, file, cb) {
      cb(null, __dirname);
   },
   filename: function (req, file, cb) {
      cb(null, 'anime.db.temp');
   }
});
const dbUpload = multer({ storage: dbUploadStorage });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
const apiBaseUrl = 'https://allanime.day';
const apiEndpoint = `https://api.allanime.day/api`;
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0';
const referer = 'https://allmanga.to';
const DEOBFUSCATION_MAP = {
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
function deobfuscateUrl(obfuscatedUrl) {
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

async function streamToString(stream) {
    if (!stream || typeof stream.pipe !== 'function') return stream;
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
}

const showsQuery = `
query ($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) {
  shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) {
    edges {
      _id
      name
      thumbnail
      description
      type
      availableEpisodesDetail
    }
  }
}
`;
async function fetchAndSendShows(res, variables, cacheKey, extensions) {
    if (cacheKey && apiCache.has(cacheKey)) {
        return res.json(apiCache.get(cacheKey));
    }
    try {
        const params = { variables: JSON.stringify(variables) };
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
        const transformedShows = shows.map(show => ({
            ...show,
            thumbnail: deobfuscateUrl(show.thumbnail || '')
        }));
        if (cacheKey) {
            apiCache.set(cacheKey, transformedShows);
        }
        res.set('Cache-Control', 'public, max-age=300');
        res.json(transformedShows);
    } catch (error) {
        console.error('Error fetching data:', error.message);
        res.status(500).send('Error fetching data');
    }
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
        const shows = recommendations.map(rec => {
            const card = rec.anyCard;
            return { ...card, thumbnail: deobfuscateUrl(card.thumbnail || '') };
        });
        apiCache.set(cacheKey, shows);
        res.set('Cache-Control', 'public, max-age=300');
        res.json(shows);
    } catch (error) {
        console.error('Error fetching popular data:', error.response ? error.response.data : error.message);
        res.status(500).send('Error fetching popular data');
    }
});
app.get('/api/latest-releases', (req, res) => {
    const variables = { search: { sortBy: 'Latest_Update', allowAdult: false }, limit: 10, page: 1, translationType: 'sub', countryOrigin: 'JP' };
    const cacheKey = 'latest-releases';
    fetchAndSendShows(res, variables, cacheKey);
});
function getCurrentAnimeSeason() {
	const month = new Date().getMonth();
	if (month >= 0 && month <= 2) return "Winter";
	if (month >= 3 && month <= 5) return "Spring";
	if (month >= 6 && month <= 8) return "Summer";
	return "Fall";
}
app.get('/api/seasonal', (req, res) => {
	const season = getCurrentAnimeSeason();
	const year = new Date().getFullYear();
    const page = parseInt(req.query.page) || 1;
	const variables = { search: { year, season, sortBy: "Latest_Update", allowAdult: false }, limit: 25, page: page, translationType: "sub", countryOrigin: "JP" };
    const cacheKey = `seasonal-${season}-${year}-p${page}`;
	fetchAndSendShows(res, variables, cacheKey);
});
app.get('/api/search', (req, res) => {
    const { query, season, year, sortBy, page, type, country, translation, genres, excludeGenres, tags, excludeTags, studios } = req.query;
    const searchObj = { allowAdult: false };
    if (query) searchObj.query = query;
    if (season && season !== 'ALL') searchObj.season = season;
    if (year && year !== 'ALL') searchObj.year = parseInt(year);
    if (sortBy) searchObj.sortBy = sortBy;
    if (type && type !== 'ALL') searchObj.types = [type];
    if (genres) searchObj.genres = genres.split(',');
    if (excludeGenres) searchObj.excludeGenres = excludeGenres.split(',');
    if (tags) searchObj.tags = tags.split(',');
    if (studios) searchObj.studios = studios.split(',');
    if (excludeTags) searchObj.excludeTags = excludeTags.split(',');

    const variables = { search: searchObj, limit: 28, page: parseInt(page) || 1, translationType: (translation && translation !== 'ALL') ? translation : 'sub', countryOrigin: (country && country !== 'ALL') ? country : 'ALL' };
    const extensions = {
        persistedQuery: {
            version: 1,
            sha256Hash: "06327bc10dd682e1ee7e07b6db9c16e9ad2fd56c1b769e47513128cd5c9fc77a"
        }
    };

    fetchAndSendShows(res, variables, null, extensions);
});
app.get('/api/schedule/:date', (req, res) => {
    const dateStr = req.params.date;
    const cacheKey = `schedule-${dateStr}`;
    if (apiCache.has(cacheKey)) {
        return res.json(apiCache.get(cacheKey));
    }
    const requestedDate = new Date(dateStr + 'T00:00:00.000Z');
    if (isNaN(requestedDate)) {
        return res.status(400).send('Invalid date format. Use YYYY-MM-DD.');
    }
    const startOfDay = new Date(requestedDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(requestedDate);
    endOfDay.setUTCHours(23, 59, 59, 999);
    const variables = { search: { dateRangeStart: Math.floor(startOfDay.getTime() / 1000), dateRangeEnd: Math.floor(endOfDay.getTime() / 1000), sortBy: "Latest_Update" }, limit: 50, page: 1, translationType: "sub", countryOrigin: "ALL" };
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
            params: { query: `query($showId: String!) { show(_id: $showId) { name, thumbnail } }`, variables: JSON.stringify({ showId }) },
            timeout: 15000
        });
        const show = response.data.data.show;
        if (show) {
            const meta = { name: show.name, thumbnail: deobfuscateUrl(show.thumbnail) };
            apiCache.set(cacheKey, meta);
            res.set('Cache-Control', 'public, max-age=300');
            res.json(meta);
        } else {
            res.status(404).json({ error: 'Show not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch show metadata' });
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
        const result = { episodes: showData.availableEpisodesDetail[mode] || [], description: showData.description };
        apiCache.set(cacheKey, result);
        res.set('Cache-Control', 'public, max-age=300');
        res.json(result);
    } catch (error) {
        res.status(500).send('Error fetching episodes from API');
    }
});

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

		const sources = data.data.episode.sourceUrls.filter(s => s.sourceUrl.startsWith('--')).sort((a, b) => b.priority - a.priority);
		
		const trustedSources = ['Default', 'wixmp', 'Yt-mp4', 'S-mp4', 'Luf-Mp4'];

        const sourcePromises = sources.map(source => (async () => {
            if (!trustedSources.includes(source.sourceName) && source.sourceName !== 'wixmp' /*wixmp is the Default source*/) {
                return null;
            }

            try {
                let decryptedUrl = (s => {
					const m = DEOBFUSCATION_MAP;
					let d = '';
					for (let i = 0; i < s.length; i += 2) d += m[s.substring(i, i + 2)] || s.substring(i, i + 2);
					return d.includes('/clock') && !d.includes('.json') ? d.replace('/clock', '/clock.json') : d;
				})(source.sourceUrl.substring(2)).replace(/([^:]\/)\/+/g, "$1");

				let videoLinks = [];
				let subtitles = [];
				if (decryptedUrl.includes('/clock.json')) {
					const finalUrl = new URL(decryptedUrl, apiBaseUrl).href;
					const { data: clockData } = await axios.get(finalUrl, {
						headers: { 'Referer': referer, 'User-Agent': userAgent },
						timeout: 10000
					});
					if (clockData.links && clockData.links.length > 0) {
						videoLinks = clockData.links[0].hls ? await (async (u, h) => {
							try {
								const { data: d } = await axios.get(u, { headers: h, timeout: 10000 });
								const l = d.split('\n'), q = [];
								for (let i = 0; i < l.length; i++)
									if (l[i].startsWith('#EXT-X-STREAM-INF')) {
										const rM = l[i].match(/RESOLUTION=\d+x(\d+)/);
										q.push({ resolutionStr: rM ? `${rM[1]}p` : 'Auto', link: new URL(l[i + 1], u).href, hls: true, headers: h });
									} return q.length > 0 ? q : [{ resolutionStr: 'auto', link: u, hls: true, headers: h }];
							} catch (e) { return []; }
						})(clockData.links[0].link, clockData.links[0].headers) : clockData.links;
						subtitles = clockData.links[0].subtitles || [];
					}
                } else if (decryptedUrl.includes('repackager.wixmp.com')) {
                    const urlTemplate = decryptedUrl.replace('repackager.wixmp.com/', '').replace(/\.urlset.*/, '');
                    const qualitiesMatch = decryptedUrl.match(/\/,\s*([^/]*),\s*\/mp4/);
                    if (qualitiesMatch && qualitiesMatch[1]) {
                        const qualities = qualitiesMatch[1].split(',');
                        videoLinks = qualities.map(q => ({
                            resolutionStr: q,
                            link: urlTemplate.replace(/,\s*[^/]*$/, q),
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
					return { sourceName: source.sourceName, links: videoLinks, subtitles };
				}
                return null;
			} catch (e) {
                return null;
            }
        })());

        const results = await Promise.allSettled(sourcePromises);
        const availableSources = results
            .filter(result => result.status === 'fulfilled' && result.value)
            .map(result => result.value);

		if (availableSources.length > 0) {
            apiCache.set(cacheKey, availableSources, 300);
            res.json(availableSources);
        } else {
            res.status(404).send('No playable video URLs found.');
        }
	} catch (e) {
		res.status(500).send(`Error fetching video data: ${e.message}`);
	}
});

app.get('/api/image-proxy', async (req, res) => {
    try {
        const axiosConfig = {
            method: 'get',
            url: req.query.url,
            responseType: 'stream',
            headers: { Referer: apiBaseUrl, 'User-Agent': userAgent },
            timeout: 10000,
            maxRedirects: 5
        };

        const { data: streamData, headers: originalHeaders } = await axios(axiosConfig);

        const contentType = originalHeaders['content-type'] && typeof originalHeaders['content-type'] === 'string'
            ? originalHeaders['content-type']
            : (function() {
                const url = req.query.url;
                const extensionMatch = url.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
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

        streamData.on('error', (err) => {
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

        res.on('error', (err) => {
            console.error('Image proxy stream error (response):', err.message);
            streamData.destroy();
        });

    } catch (e) {
        console.error('Image proxy error:', e.message);
        res.status(200).sendFile(path.join(__dirname, '..','public/placeholder.svg'));
    }
});

app.get('/api/proxy', async (req, res) => {
    const requestId = crypto.randomBytes(4).toString('hex');
    const { url, referer: dynamicReferer } = req.query;

    try {
        const headers = { 
            'User-Agent': userAgent, 
            'Accept': '*/*',
            'Connection': 'keep-alive'
        };
        if (dynamicReferer) headers['Referer'] = dynamicReferer;

        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        if (url.includes('.m3u8')) {
            const response = await axios.get(url, { headers, responseType: 'text', timeout: 15000 });
            
            console.log(`[${requestId}] /proxy: m3u8 remote response status: ${response.status}`);
            
            const baseUrl = new URL(url);
            const rewritten = response.data.split('\n').map(l =>
                (l.trim().length > 0 && !l.startsWith('#'))
                    ? `/api/proxy?url=${encodeURIComponent(new URL(l, baseUrl).href)}&referer=${encodeURIComponent(dynamicReferer || referer)}`
                    : l
            ).join('\n');
            res.set('Content-Type', 'application/vnd.apple.mpegurl').send(rewritten);
        } else {
            const streamResponse = await axios({ 
                method: 'get', 
                url, 
                responseType: 'stream', 
                headers, 
                timeout: 20000 
            });

            res.status(streamResponse.status);
            res.set(streamResponse.headers);

            req.on('close', () => {
                streamResponse.data.destroy();
            });

            streamResponse.data.pipe(res);
            streamResponse.data.on('error', (err) => {

                if (err.code !== 'ECONNRESET') {
                }

                if (!res.headersSent) {
                    res.status(500).send('Error during streaming from remote.');
                }
                res.end();
            });

            streamResponse.data.on('end', () => {
            });
        }
    } catch (e) {
        if (e.response) {
            const errorBody = await streamToString(e.response.data).catch(() => 'Could not read error stream.');
            if (!res.headersSent) res.status(e.response.status).send(`Proxy error: ${e.message}`);
        } else if (e.request) {
            if (!res.headersSent) res.status(504).send(`Proxy error: Gateway timeout.`);
        } else {
            if (!res.headersSent) res.status(500).send(`Proxy error: ${e.message}`);
        }
        if (res.writable && !res.headersSent) {
        } else if (res.writable) {
           res.end();
        }
    }
});

app.get('/api/subtitle-proxy', async (req, res) => {
    try {
        const response = await axios.get(req.query.url, { responseType: 'text', timeout: 10000 });
        res.set('Content-Type', 'text/vtt; charset=utf-8').send(response.data);
    } catch (error) {
        res.status(500).send(`Proxy error: ${error.message}`);
    }
});

app.get('/api/profiles', (req, res) => {
    db.all('SELECT * FROM profiles ORDER BY name', [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json(rows);
    });
});
app.get('/api/profiles/:id', (req, res) => {
    db.get('SELECT * FROM profiles WHERE id = ?', [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        if (!row) return res.status(404).json({ error: 'Profile not found' });
        res.json(row);
    });
});

app.get('/api/schedule-info/:showId', async (req, res) => {
    const { showId } = req.params;
    const cacheKey = `schedule-info-${showId}`;
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
        
        if (firstResult && firstResult.route) {
            const status = firstResult.status || "Unknown";
            let nextEpisodeAirDate = null;

            if (status === 'Ongoing') {
                const pageResponse = await axios.get(`https://animeschedule.net/anime/${firstResult.route}`, { timeout: 10000 });
                const countdownMatch = pageResponse.data.match(/countdown-time" datetime="([^"]*)"/);
                if (countdownMatch) {
                    nextEpisodeAirDate = countdownMatch[1];
                }
            }

            const result = {
                nextEpisodeAirDate: nextEpisodeAirDate,
                status: status.replace(/([A-Z])/g, ' $1').trim()
            };

            apiCache.set(cacheKey, result, 3600);
            return res.json(result);
        }

        return res.json({ status: "Not Found on Schedule" });

    } catch (error) {
        return res.json({ status: "Error" });
    }
});

app.post('/api/profiles', (req, res) => {
    const { name } = req.body;
    if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Profile name cannot be empty.' });
    }
    db.run('INSERT INTO profiles (name) VALUES (?)', [name.trim()], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to create profile. Name might already exist.' });
        }
        res.json({ id: this.lastID, name: name.trim() });
    });
});
app.post('/api/profiles/:id/picture', profilePicUpload.single('profilePic'), (req, res) => {
    const profileId = req.params.id;
    if (!req.file) {
        return res.status(400).json({ error: 'No picture uploaded.' });
    }
    const picturePath = `/profile_pics/${req.file.filename}`;
    db.run('UPDATE profiles SET picture_path = ? WHERE id = ?', [picturePath, profileId], function (err) {
        if (err) return res.status(500).json({ error: 'Failed to update profile picture in DB.' });
        res.json({ success: true, path: picturePath });
    });
});
app.put('/api/profiles/:id', (req, res) => {
    const { name } = req.body;
    const { id } = req.params;
    if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Profile name cannot be empty.' });
    }
    db.run('UPDATE profiles SET name = ? WHERE id = ?', [name.trim(), id], function(err) {
        if (err) return res.status(500).json({ error: 'Failed to update profile. Name might already exist.' });
        if (this.changes === 0) return res.status(404).json({ error: 'Profile not found.' });
        res.json({ success: true });
    });
});
app.delete('/api/profiles/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT COUNT(*) as count FROM profiles', (err, row) => {
        if (row.count <= 1) {
            return res.status(400).json({ error: 'Cannot delete the last profile.' });
        }
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            db.run('DELETE FROM watchlist WHERE profile_id = ?', [id]);
            db.run('DELETE FROM watched_episodes WHERE profile_id = ?', [id]);
            db.run('DELETE FROM settings WHERE profile_id = ?', [id]);
            db.run('DELETE FROM profiles WHERE id = ?', [id], (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Failed to delete profile.' });
                }
                db.run('COMMIT');
                res.json({ success: true });
            });
        });
    });
});

app.post('/api/import/mal-xml', async (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });
    const { xml, erase } = req.body;
    if (!xml) {
        return res.status(400).json({ error: 'XML content is required' });
    }
    if (erase) {
        await new Promise((resolve, reject) => {
            db.run(`DELETE FROM watchlist WHERE profile_id = ?`, [profileId], (err) => { if (err) reject(new Error('DB error on erase.')); else resolve(); });
        });
    }
    parseString(xml, async (err, result) => {
        if (err || !result || !result.myanimelist || !result.myanimelist.anime) {
            return res.status(400).json({ error: 'Invalid or empty MyAnimeList XML file.' });
        }
        const animeList = result.myanimelist.anime;
        let importedCount = 0;
        let skippedCount = 0;
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
                    await new Promise((resolve, reject) => {
                        db.run(`INSERT OR REPLACE INTO watchlist (profile_id, id, name, thumbnail, status) VALUES (?, ?, ?, ?, ?)`, 
                            [profileId, foundShow._id, foundShow.name, deobfuscateUrl(foundShow.thumbnail), malStatus],
                            (err) => { if (err) reject(err); else { importedCount++; resolve(); } }
                        );
                    });
                } else { skippedCount++; }
            } catch (searchError) { skippedCount++; }
        }
        res.json({ imported: importedCount, skipped: skippedCount });
    });
});

app.post('/api/watchlist/add', (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });
    const { id, name, thumbnail, status } = req.body;
    const finalThumbnail = deobfuscateUrl(thumbnail || '');
    db.run(`INSERT OR REPLACE INTO watchlist (profile_id, id, name, thumbnail, status) VALUES (?, ?, ?, ?, ?)`, 
        [profileId, id, name, finalThumbnail, status || 'Watching'],
        (err) => err ? res.status(500).json({ error: 'DB error' }) : res.json({ success: true })
    );
});app.get('/api/watchlist/check/:showId', (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });
    db.get('SELECT EXISTS(SELECT 1 FROM watchlist WHERE profile_id = ? AND id = ?) as inWatchlist',
        [profileId, req.params.showId],
        (err, row) => err ? res.status(500).json({ error: 'DB error' }) : res.json({ inWatchlist: !!row.inWatchlist })
    );
});
app.post('/api/watchlist/status', (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });
    const { id, status } = req.body;
    db.run(`UPDATE watchlist SET status = ? WHERE profile_id = ? AND id = ?`,
        [status, profileId, id],
        (err) => err ? res.status(500).json({ error: 'DB error' }) : res.json({ success: true })
    );
});
app.get('/api/watchlist', (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });

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

    db.all(`SELECT * FROM watchlist WHERE profile_id = ? ${orderByClause}`, [profileId],
        (err, rows) => err ? res.status(500).json({ error: 'DB error' }) : res.json(rows)
    );
});
app.post('/api/watchlist/remove', (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });
    db.run(`DELETE FROM watchlist WHERE profile_id = ? AND id = ?`,
        [profileId, req.body.id],
        (err) => err ? res.status(500).json({ error: 'DB error' }) : res.json({ success: true })
    );
});

app.post('/api/update-progress', (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });
    const { showId, episodeNumber, currentTime, duration, showName, showThumbnail } = req.body;

    db.serialize(() => {
        db.run('INSERT OR IGNORE INTO shows_meta (id, name, thumbnail) VALUES (?, ?, ?)',
            [showId, showName, deobfuscateUrl(showThumbnail)]);

        db.run(`INSERT OR REPLACE INTO watched_episodes (profile_id, showId, episodeNumber, watchedAt, currentTime, duration) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`, 
            [profileId, showId, episodeNumber, currentTime, duration],
            (err) => {
                if (err) return res.status(500).json({ error: 'DB error on progress update' });
                res.json({ success: true });
            }
        );
    });
});

app.get('/api/episode-progress/:showId/:episodeNumber', (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });
    const { showId, episodeNumber } = req.params;

    db.get('SELECT currentTime, duration FROM watched_episodes WHERE profile_id = ? AND showId = ? AND episodeNumber = ?',
        [profileId, showId, episodeNumber], (err, row) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json(row || { currentTime: 0, duration: 0 });
    });
});

app.get('/api/watched-episodes/:showId', (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });
    db.all(`SELECT episodeNumber FROM watched_episodes WHERE profile_id = ? AND showId = ?`,
        [profileId, req.params.showId],
        (err, rows) => err ? res.status(500).json({ error: 'DB error' }) : res.json(rows.map(r => r.episodeNumber))
    );
});

app.get('/api/continue-watching', (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });
    const query = `
        SELECT sm.id as showId, sm.name, sm.thumbnail, we.episodeNumber, we.currentTime, we.duration
        FROM shows_meta sm
        JOIN (
           SELECT showId, episodeNumber, currentTime, duration, MAX(watchedAt) as watchedAt
           FROM watched_episodes
           WHERE profile_id = ?
           GROUP BY showId
        ) we ON sm.id = we.showId
        ORDER BY we.watchedAt DESC
        LIMIT 10;
    `;
    db.all(query, [profileId], async (err, rows) => {
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
                    const allEps = epResponse.data.data.show.availableEpisodesDetail.sub?.sort((a, b) => parseFloat(a) - parseFloat(b)) || [];
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
            console.error("API Error in /continue-watching", apiError);
            res.status(500).json({ error: 'API error while resolving next episodes' });
        }
    });
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
    } catch (error) {
        apiCache.set(cacheKey, notFoundResponse);
        res.json(notFoundResponse);
    }
});

app.post('/api/continue-watching/remove', (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });
    const { showId } = req.body;
    db.run(`DELETE FROM watched_episodes WHERE profile_id = ? AND showId = ?`,
        [profileId, showId],
        (err) => err ? res.status(500).json({ error: 'DB error' }) : res.json({ success: true })
    );
});

app.get('/api/settings/:key', (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });
    db.get('SELECT value FROM settings WHERE profile_id = ? AND key = ?', [profileId, req.params.key], (err, row) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ value: row ? row.value : null });
    });
});
app.post('/api/settings', (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });
    const { key, value } = req.body;
    db.run('INSERT OR REPLACE INTO settings (profile_id, key, value) VALUES (?, ?, ?)', [profileId, key, value], (err) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ success: true });
    });
});
app.get('/api/backup-db', (req, res) => {
   res.download(dbPath, 'ani-web-backup.db', (err) => {
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
   db.close((err) => {
      if (err) {
         console.error('Failed to close database for restore:', err.message);
         return res.status(500).json({ error: 'Failed to close current database.' });
      }
      fs.rename(tempPath, dbPath, (err) => {
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

app.post('/api/rclone-upload', (req, res) => {
    const script = process.platform === 'win32' ? 'upload_db.bat' : './upload_db.sh';
    exec(script, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return res.status(500).json({ error: `Script Error: ${stderr}` });
        }
        res.json({ message: `Upload successful: ${stdout}` });
    });
});

app.post('/api/rclone-download', (req, res) => {
    db.close((err) => {
        if (err) {
            console.error('Failed to close database before rclone download:', err.message);
            initializeDatabase(); 
            return res.status(500).json({ error: 'Failed to close current database for update.' });
        }

        const script = process.platform === 'win32' ? 'download_db.bat' : './download_db.sh';
        exec(script, (error, stdout, stderr) => {
            initializeDatabase();

            if (error) {
                console.error(`exec error: ${error}`);
                return res.status(500).json({ error: `Script Error: ${stderr}` });
            }
            
            res.json({ message: `Download successful: ${stdout}` });
        });
    });
});

app.use(express.static(path.join(__dirname, '../dist')));
app.use('/profile_pics', express.static(profilePicsDir));

app.get('/api/genres-and-tags', async (req, res) => {
    const genres = ['Action', 'Adventure', 'Cars', 'Comedy', 'Dementia', 'Demons', 'Drama', 'Fantasy', 'Game', 'Harem', 'Historical', 'Horror', 'Isekai', 'Romance', 'Psychological', 'Police', 'Parody', 'Mystery', 'Music', 'Military', 'Mecha', 'Kids', 'Josei', 'Magic', 'Martial Arts', 'Super Power', 'Sports', 'Space', 'Slice of Life', 'Shounen Ai', 'Shounen', 'Shoujo Ai', 'Shoujo', 'Seinen', 'Sci-Fi', 'School', 'Samurai', 'Yuri', 'Yaoi', 'Vampire', 'Unknown', 'Thriller', 'Ecchi'];
    const tags = [
    'Meta',
    'Kemonomimi',
    'Doctor',
    'Time Skip',
    'Primarily Child Cast',
    'Photography',
    'Parkour',
    'Primarily Male Cast',
    'Vore',
    'College',
    'Medieval',
    'Masochism',
    'Class Struggle',
    'Polyamorous',
    'Exhibitionism',
    'Urban',
    'Military',
    'Fugitive',
    'Monster Boy',
    'Shrine Maiden',
    'Work',
    'Aromantic',
    'Ojou-sama',
    'Office Lady',
    'Real Robot',
    'War',
    'Crime',
    'Kuudere',
    'Language Barrier',
    'Samurai',
    'Pirates',
    'Card Battle',
    'Prison',
    'Scuba Diving',
    'Shapeshifting',
    'Medicine',
    'Mixed Gender Harem',
    'Ninja',
    'School Life',
    'Monster Girl',
    'Episodic',
    'Yakuza',
    'Disability',
    'Assassins',
    'Anachronism',
    'Fairy',
    'Archery',
    'Skeleton',
    'Weak to Strong',
    'Slapstick',
    'Witch',
    'Mermaid',
    'Tragedy',
    'Parenthood',
    'Anthropomorphism',
    'Otaku Culture',
    'Memory Manipulation',
    'Revenge',
    'Noir',
    'Time Loop',
    'Time Manipulation',
    'Primarily Female Cast',
    'Desert',
    'Travel',
    'Male Harem',
    'Exorcism',
    'Dystopian',
    'Cosplay',
    'Rotoscoping',
    'Op-Mc',
    'Amnesia',
    'Coming of Age',
    'Philosophy',
    'Cultivation',
    'Male Protagonist',
    'Boarding School',
    'Tsundere',
    'Bar',
    'Historical',
    'POV',
    'Virtual World',
    'Hikikomori',
    'CGI',
    'Robots',
    'Suicide',
    'Agriculture',
    'Cute Boys Doing Cute Things',
    'Motorcycles',
    'Mature',
    'Age Gap',
    'Body Horror',
    'Guns',
    'Henshin',
    'Denpa',
    'Female Protagonist',
    'Swordplay',
    'Surreal Comedy',
    'Death Game',
    'Shounen',
    'Vampire',
    'Femboy',
    'Iyashikei',
    'Slavery',
    'System',
    'Gender Bending',
    'Transgender',
    'Crossdressing',
    'Urban Fantasy',
    'Drugs',
    'Primarily Adult Cast',
    'Steampunk',
    'Magic',
    'Super Power',
    'Acting',
    'Alchemy',
    'Female Harem',
    'School Club',
    'Virginity',
    'Yuri',
    'Kaiju',
    'Boys\' Love',
    'Goblin',
    'Surfing',
    'Dissociative Identities',
    'Unrequited Love',
    'Crossover',
    'Anthology',
    'Dancing',
    'Rehabilitation',
    'Espionage',
    'Parody',
    'Ensemble Cast',
    'Curses',
    'Survival',
    'Alternate Universe',
    'Cohabitation',
    'Fashion',
    'Police',
    'Satire',
    'Artificial Intelligence',
    'Youkai',
    'Found Family',
    'Educational',
    'Criminal Organization',
    'Creature Taming',
    'Xuanhuan',
    'Shoujo',
    'Royal Affairs',
    'Achronological Order',
    'Vikings',
    'Hypersexuality',
    'Sadism',
    'Chibi',
    'Werewolf',
    'Conspiracy',
    'Age Regression',
    'Delinquents',
    'Battle Royale',
    'Cute Girls Doing Cute Things',
    'Seinen',
    'Lost Civilization',
    'Chuunibyou',
    'Clone',
    'Eco-Horror',
    'Cyborg',
    'Cosmic Horror',
    'Konbini',
    'Post-Apocalyptic',
    'Overpowered Protagonist',
    'Food',
    'Family Life',
    'School',
    'Demons',
    'Primarily Teen Cast',
    'Inseki',
    'Josei',
    'Anti-Hero',
    'Marriage',
    'Necromancy',
    'Cheat Systems',
    'Tanned Skin',
    'Transmigration',
    'Reincarnation',
    'Video Games',
    'Adaptation',
    'Maids',
    'Space Opera',
    'Snowscape',
    'Cult',
    'Afterlife',
    'Tokusatsu',
    'Torture',
    'Bullying',
    'Gore',
    'Dragons',
    'Band',
    'Politics',
    'Terrorism',
    'Superhero',
    'Elf',
    'Manhua',
    'Outdoor',
    'Gyaru',
    'Full Color',
    'Femdom',
    'Nekomimi',
    'Body Swapping',
    'Cheat Skill/s',
    'Pill Refinement',
    'Succubus',
    'Tomboy',
    'Martial Arts',
    'Religion',
    'Kingdom Management',
    'Dungeon',
    'Love Triangle',
    'Mixed Media',
    'Psychosexual',
    'Football',
    'Idol',
    'Agender',
    'Drawing',
    'Basketball',
    'Zombie',
    'Restaurant',
    'Gods',
    'Aliens',
    'Full CGI',
    'Open to Interpretation',
    'VTuber',
    'Fake Relationship',
    'Aviation',
    'Table Tennis',
    'Cyberpunk',
    'Twins',
    'Hot-Blood',
    'Villainess',
    'Mythology',
    'Volleyball',
    'Sumo',
    'Monsters',
    'Ghost',
    'Detective',
    'Super Robot',
    'Economics',
    'Software Development',
    'Astronomy',
    'Feet',
    'Isekai',
    'Airsoft',
    'Angels',
    'Cannibalism',
    'Animals',
    'Homeless',
    'Orphan',
    'Arranged Marriage',
    'Adoption',
    'Gangs',
    'Butler',
    'Wrestling',
    'Yandere',
    'Trains',
    'Foreign',
    'Teacher',
    'Proxy Battle',
    'Ships',
    'Kids',
    'Fairy Tale',
    'Monster Tamer',
    'Mahjong',
    'Boxing',
    'Space',
    'Environmental',
    'Game Elements',
    'China Cultivation Gangs',
    'Wuxia',
    'Cars',
    'Tanks',
    'Fitness',
    'Estranged Family',
    'Ancient China',
    'Outdoor Activities',
    'Athletics',
    'Spearplay',
    'Rural',
    'Autobiographical',
    'Funny',
    'Firefighters',
    'Calligraphy',
    'Invincible',
    'Zoophilia',
    'Gambling',
    'Classic Literature',
    'Mafia',
    'Pandemic',
    'Ice Skating',
    'Baseball',
    'Golf',
    'E-Sports',
    'Cycling',
    'Inn',
    'Youth',
    'Body Swap/s',
    'Rock Music',
    'Musical Theater',
    'Vocal synth',
    'Adult',
    'Dullahan',
    'Fat Male Lead',
    'Beast',
    'Musical',
    'Dinosaurs',
    'Time Rewind',
    'Immortality',
    'Go',
    'Shogi',
    'LGBTQ+ Themes',
    'Rakugo',
    'Skateboarding',
    'Primarily Animal Cast',
    'Transported to Another World',
    'Writing',
    'Centaur',
    'Fat Protagonist',
    'Manga',
    'Blood',
    'Swimming',
    'Nun',
    'Advertisement',
    'Protagonist',
    'Achromatic',
    'Augmented Reality',
    'Poisons',
    'Swords fight',
    'Reborn',
    'Reincarnated',
    'Old to Young',
    'Past Plays a Big Role',
    'Rebirth',
    'Strong to Overpowered',
    'Travelling Between Worlds',
    'Circus',
    'Stop Motion',
    'Strong Protagonist',
    'Makeup',
    'Pretending Male Lead',
    'Puppetry',
    'Vengeance',
    'Gender Swapped Character/s',
    'Xianxia',
    '4-koma',
    'Gender Bender',
    'Medicines',
    'Power Fantasy',
    'Villain',
    'Overpowered Male Lead',
    'Modern Era',
    'Transmigrated into Another World',
    'No Dialogue',
    'Chimera',
    'Video Game',
    'Flash',
    'Biographical',
    'Metal Music',
    'Fanatsy',
    'Time Travel',
    'Pretending Character/s',
    'Rescue',
    'Dark Fantasy',
    'Betrayal'
];

const studio = [
    'Pierrot',
    'Nexus',
    'C2C',
    'SynergySP',
    'Toei Animation',
    'Science SARU',
    'Studio A-CAT',
    'Artland',
    'TMS Entertainment',
    'Liber',
    'Zero-G',
    'Studio MOTHER',
    'David Production',
    'P.A. Works',
    'Thundray',
    'B.CMAY PICTURES',
    'BUG FILMS',
    'J.C.Staff',
    'AXsiZ',
    'Studio Gokumi',
    'BloomZ',
    'LIDENFILMS',
    'Suoyi Technology',
    'Sunrise',
    'Asread',
    'Shaft',
    'Actas',
    'Group TAC',
    'LandQ studios',
    'Staple Entertainment',
    'Craftar Studios',
    'Bibury Animation Studios',
    'Connect',
    'Millepensee',
    'Studio Elle',
    'Asread.',
    'Doga Kobo',
    'TNK',
    'Bones',
    'Tsumugi Akita Animation Lab',
    'AHA Entertainment',
    'Sharefun',
    'White Fox',
    'Studio Fantasia',
    'Okuruto Noboru',
    'Enishiya',
    'Wit',
    'Orange',
    'Bones Film',
    'Lay-duce',
    'Bee Train',
    'Production I.G',
    'Studio Blanc.',
    'CygamesPictures',
    'TrioPen',
    'Project No.9',
    'Hoods Entertainment',
    'Studio Ghibli',
    'Passione',
    'Trigger',
    'Arvo Animation',
    'Wolfsbane',
    'Maho Film',
    'Seven',
    'CloverWorks',
    'Lerche',
    'Studio Hibari',
    'Ufotable',
    'UWAN Pictures',
    'Yumeta Company',
    'Studio Lings',
    'Ark',
    'Studio Hokiboshi',
    'Manglobe',
    'MAPPA',
    'Green Bunny',
    'Shin-Ei Animation',
    'Magic Bus',
    'Tamura Shigeru',
    'Studio Signpost',
    'GEEKTOYS',
    'DRAWIZ',
    'Studio Chizu',
    'Viz Media',
    'Ruo Hong Culture',
    'Triangle Staff',
    'Ordet',
    'Brain\'s Base',
    'Studio Clutch',
    'OLM',
    'Gainax',
    'Domerica',
    'AIC Spirits',
    'Quad',
    'Pony Canyon',
    'Paper Plane Animation',
    'Studio LAN',
    'Sotsu',
    'Studio DURIAN',
    'Haoliners Animation',
    'Namu Animation',
    'Pandanium',
    'Colored Pencil Animation',
    'ILCA',
    'A-1 Pictures',
    'Topcraft',
    'AIC',
    'EMT Squared',
    'Feel.',
    'Studio Colorido',
    'Team Yamahitsuji',
    'Egg Firm',
    'SILVER LINK.',
    'TOHO animation',
    'Arms',
    'Kyoto Animation',
    'Madhouse',
    'Studio Bind',
    'Studio DEEN',
    'Studio Pierrot',
    'CoMix Wave Films',
    'Big Firebird Culture',
    'M.S.C',
    'PRA',
    'Lesprit',
    '8-bit',
    'Xebec',
    'Asmik Ace',
    'Signal.MD',
    'Soigne',
    'Saber Works',
    'Bridge',
    'WonderLand',
    'Studio Comet',
    'Diomedéa',
    'Shuka',
    'Elias',
    'Typhoon Graphics',
    'Yostar Pictures',
    'Drive',
    'Revoroot',
    'GARDEN',
    'A-Real',
    'Anima',
    'Kamikaze Douga',
    'TROYCA',
    'Seven Arcs',
    'ChuChu',
    'Raiose',
    'Blade',
    'Xing Yi Kai Chen',
    'Studio Silver',
    'Tear',
    'Wonder Cat Animation',
    'LAN',
    'Pb Animation',
    'Skyloong',
    'Studio 3Hz',
    'Children\'s Playground Entertainment',
    'Imagica Infos',
    'Jumondou',
    'C-Station',
    'Ajia-do',
    'Akatsuki',
    'AQUA ARIS',
    'Fugaku',
    'DAX Production',
    'DLE',
    'Gonzo',
    'HuaMei Animation',
    'Makaria',
    'Avex Entertainment',
    'Genco',
    'GoHands',
    'Zexcs',
    'Nippon Animation',
    'Tatsunoko Production',
    'APPP',
    'Studio Gallop',
    'Studio Wombat',
    'Studio Signal',
    'Daume',
    'Studio Flad',
    'CALF',
    'Vasoon Animation',
    'Studio Blanc',
    'Teddy',
    'Hayabusa Film',
    'Imageworks',
    'Tokyo Movie Shinsha',
    'Tezuka Productions',
    'HAL Film Maker',
    'Studio KAI',
    'Larx Entertainment',
    'ABJ COMPANY',
    'Telecom Animation Film',
    'Studio 4°C',
    'Lilix',
    'Motion Magic',
    'Azeta Pictures',
    'Think Corporation',
    'Joicy',
    'LICO',
    'NAZ',
    'Nomad',
    'The Answer',
    'East Fish',
    'Samsara Animation',
    'Felix Film',
    'CMC Media',
    'Studio VOLN',
    'PINE JAM',
    'Asahi Production',
    'Encourage Films',
    'Shenman Entertainment',
    'A.C.G.T.',
    'Gekkou',
    'Nut',
    'Koei',
    'BUILD DREAM',
    'Anime R',
    'Imagin',
    'BigFireBird Animation',
    'Fanworks',
    'Imagineer',
    '8bit',
    'Chaos Project',
    'Studio M2',
    'Studio CANDY BOX',
    'Wawayu Animation',
    'BYMENT',
    'Kachigarasu',
    'Infinity Vision',
    'LIDENFILMS Kyoto',
    'Chongzhuo Animation',
    'PHANTOM',
    'Atelier Pontdarc',
    'Sakura Create',
    'Animation Do',
    'Yien Animation',
    'FENZ',
    'Animate Film',
    'Studio Palette',
    'Studio Bingo',
    'Studio Kikan',
    'Studio Kyuuma',
    'CoMix Wave',
    'Djinn Power',
    'D.ROCK-ART',
    'Ashi Productions',
    'Yokohama Animation Laboratory',
    'Fortes',
    'HORNETS',
    'Bouncy',
    'Sunflowers',
    'Haoliners Animation League',
    'TV Tokyo',
    'Sprite Animation Studios',
    'Flying Fish',
    'Digital Network Animation',
    'Production IMS',
    'Shirogumi',
    'Hotline',
    'Issen',
    'Studio Moriken',
    'Miyu Productions',
    'Yokohama Animation Lab',
    'Visual Flight',
    'Gallop',
    'GARDEN Culture',
    'Lapin Track',
    'Monofilmo',
    'Qingxiang Culture',
    'Sunrise Beyond',
    'Geek Toys',
    'Fairy Tale Co.',
    'AIC ASTA',
    'Tianshi Wenhua',
    'Success Corp.',
    'PPM',
    'Pastel',
    'Square Enix',
    'Zero-G Room',
    'Cloud Art',
    'Studio Khara',
    'Plum',
    'Production Reed',
    'Graphinica',
    'Bakken Record',
    'Studio Guts',
    'Studio Core',
    'AIC Build',
    'Creators in Pack',
    'Yasuda Genshou by Xenotoon',
    'Husio',
    'Code',
    'Trash',
    'Crius Animation',
    'ADV Films',
    'Platinum Vision',
    'Liyu Culture',
    'Oh! Production',
    'Suna Kouhou',
    'Takahashi',
    'Shengying Animation',
    'Mippei Eigeki Kiryuukan',
    'Studio Jack',
    'Studio Massket',
    'Foch Film',
    'ENGI',
    'Coco Cartoon',
    'Cloud Hearts',
    'Kachidoki',
    'Toho Interactive Animation',
    'Sofix',
    'BeSTACK',
    'Agent 21',
    'Studio Hakk',
    'Jumondo',
    'Studio Add',
    'Flat',
    'Tokyo Kids',
    'IMAGICA Lab.',
    'Studio PuYUKAI',
    'Mili Pictures',
    'Viewworks',
    'Bee Media',
    'Trans Arts',
    'Foch Films',
    'Ether Kitten',
    'ACiD FiLM',
    'Flint Sugar',
    'Nihon Hoso Eigasha',
    'Production doA',
    'Studio Moe',
    'EXNOA',
    'Shi Qi Yu Mo',
    'Seven Arcs Pictures',
    'Mushi Production',
    'Dynamo Pictures',
    'Light Chaser Animation',
    'Light Chaser Animation Studios',
    'Procen',
    'Soft Garage',
    'Gaina',
    'SANZIGEN',
    'GRIZZLY',
    'CG Year',
    'Yamiken',
    'Studio Sign',
    'Fifth Avenue',
    'Red Dog Culture House',
    'Kaname Production',
    'Scooter Films',
    'NHK',
    'Studio Junior',
    'Dream Creation',
    'Manga Productions',
    'Xiaoming Taiji',
    'Knack Productions',
    'Darts',
    'BETOBE',
    'Big Bang',
    'Studio Rikka',
    'Radix',
    'Tsuburaya Productions',
    'Quebico',
    'Polygon Pictures',
    'Ripple Film',
    'Dongyang Animation',
    'Sasayuri',
    '2:10 AM Animation',
    'EOTA',
    'Dream Force',
    'Adnero',
    'Nagomi',
    'ILCASHIPS',
    'Shogakukan Productions',
    'Crew-Cell',
    'Artmic',
    'Kumarba',
    'A-Line',
    'L²Studio',
    'Picona',
    'TYO Animations',
    'Tang Kirin Culture',
    'Tianwen Kadokawa',
    'Hoods Drifters',
    'Gift-o’-Animation',
    'Studio Jemi',
    'Pierrot Films',
    'October Media',
    'D.A.S.T.',
    'CLAP',
    'Pepper Conpanna',
    'Qualia Animation',
    'Telescreen',
    'Original Force',
    'Picture Magic',
    'Trinet Entertainment',
    'Durufix',
    'Spooky graphic',
    'Coastline Animation',
    'SIDO LIMITED',
    'AIC A.S.T.A.',
    'Triple X',
    'Hololive Production',
    'Delphi Sound',
    'Unend',
    'Fatchi Moxie',
    'WAO World',
    'Square Pictures',
    'Studio Goindol',
    'Venet',
    'Ishikawa Pro',
    'Lide',
    'GANSIS',
    'Seven Stone Entertainment',
    'Milky Cartoon',
    'Central Park Media',
    'Saetta',
    'UchuPeople',
    'Beijing Sharaku Art',
    'Reirs',
    'ASK Animation',
    'Marvy Jack',
    'Anpro',
    'Observatory Animation',
    'Transcendence Picture',
    'Pierrot Plus',
    'Gathering',
    'Ajiado',
    'Dwarf',
    'Space Neko Company',
    '100studio',
    'Paper Animation',
    'CompTown',
    'Ankama Animations',
    'Studio Bogey',
    'Yaoyorozu',
    'Sanrio',
    'Ga-Crew',
    '2:10 Animation',
    'KENMedia',
    'Studio Live',
    'Fever Creations',
    'Planet Cartoon',
    'Painting Dream',
    'OZ',
    'Geidai Animation',
    'Sunborn Network Technology',
    'KSS',
    'Qiyuan Yinghua',
    'S.o.K',
    'Drop',
    'Chuangpu Animation',
    'Studio March',
    'Big Firebird Cultural Media',
    'Magilm Pictures',
    'Digital Frontier',
    'Production Wave',
    'Green Planet',
    'WinSing Animation',
    'Sola Digital Arts',
    'Monster\'s Egg',
    'Studio Ponoc',
    'Tin House',
    'Kung Fu Frog Animation',
    'Pb Animation Co. Ltd.',
    'IDREAM Entertainment',
    'Geno',
    'Axis Studios',
    'YHKT Entertainment',
    'Eiken',
    'Stellar Pictures',
    'Changchun Unity of Knowledge and Action Animation',
    'Trilogy Future',
    'Foch',
    'Ezόla',
    'Climax',
    'L-a-unch・BOX',
    'Soyep',
    'Japan Vistec',
    'Sublimation',
    'Lxtl',
    'LinQ',
    'DMM.futureworks',
    'Front Wing',
    'EKACHI EPILKA',
    'Ginga Ya',
    'Sparky Animation',
    'Xiaoying Feiyang Pictures',
    'Chiptune',
    'Kent House',
    'Soeishinsha',
    'Studio Sota',
    'Idea Factory',
    'TMX Art',
    'Zhongce Picture',
    'Vega Entertainment',
    'Studio Anima',
    'Studio Junio',
    'Qzil.la',
    'Aeonium',
    'Bandai',
    'Oriental Creative Color',
    'Ai Si Animation',
    'Kaname Productions',
    'DC Impression Vision',
    'Anime Tokyo',
    'PP Project',
    'NAS',
    'Dai-Ichi Douga',
    'Minami Machi Bugyousho',
    'Frontier Works',
    'Enterbrain',
    'JCF',
    'Capcom',
    'Marza Animation Planet',
    'Palm',
    'TBS',
    'Ginga Teikoku',
    'GIFTanimation',
    'GEMBA',
    'Xiron Animation',
    'Barnum',
    'Xebec Zwei',
    'StudioRF Inc.',
    'Unity of Knowledge and Action Animation',
    'Team OneOne',
    'Voil',
    'Borutong',
    'Studio Matrix',
    'Buemon',
    'Khara',
    'LX Animation',
    'Gen Long Culture',
    'Kuai Ying Hu Yu',
    'Jinnis Animation Studios',
    '5 Inc.',
    'Alpha Animation',
    'Academy Productions',
    'Sovat Theater',
    'Studio Shelter',
    'DR Movie',
    'Rocen',
    'Kaca Entertainment',
    'Pie in the sky',
    'Zhuo Hua Network',
    'Studio OX',
    'Mu Animation',
    'Super Normal',
    'I.Gzwei',
    'Project Team Argos',
    'HMCH',
    'Qiying Animation',
    'Niceboat Animation',
    'Team YokkyuFuman',
    'Xuni Pictures',
    'Studio Daisy',
    'TeamKG',
    'Tama Production',
    'CGCG',
    'Aubec',
    'Cartoon Saloon',
    'Indivision',
    'Wolf Smoke',
    'Anime Room',
    'Atelier Giga',
    'Lunch Box',
    'Tokyo Movie',
    'MMT',
    'Green Monster Team',
    'Robot',
    'Saigo no Shudan',
    'Studio Tulip',
    'Blaze',
    'NHK Enterprises',
    'Studio Kelmadick',
    'Ashi Production',
    'Kanaban Graphics',
    'KJJ Animation',
    'Kazami Gakuen Koushiki Douga-bu',
    'Studio Kingyoiro',
    'Dai Nippon Printing',
    'Enoki Films',
    'Beat Frog',
    'Tomason',
    'Shanghai Animation Film',
    'Aqua Entertainment',
    'Kyotoma',
    'ALBACROW',
    'Jumonji',
    'Evg',
    'Animaruya',
    'Bandai Entertainment',
    'CyberConnect2',
    'Gravity Well',
    'Studio Animal',
    'AT-X',
    'Delight Animation',
    'Kino Production',
    'ACC Production',
    'Tri-Slash',
    'Animation Staff Room',
    'Passion Paint Animation',
    'Tomovies',
    'UKA',
    'Mandrill Picture Corp',
    'T-UP',
    'Imagica',
    'Studio Mir',
    'Studio N',
    'TthunDer Animation',
    'Konami animation',
    'Pancake',
    'Kokusai Eigasha',
    'DOGA Productions',
    'Shochiku',
    'Fukushima Gaina',
    'Studio GOONEYS',
    'Gosay',
    'TIA',
    'W-Toon',
    'DandeLion Animation',
    'Mook DLE',
    'Alke',
    'Phoenix Entertainment',
    'ROLL2',
    'K.PICTURES',
    'Hero',
    'Dawn Animation',
    'Maple Toon',
    'Studio Take Off',
    'TriF',
    'Front Line',
    'Panda Tower',
    'Synergy Japan',
    'GAGA Communications',
    'Studio Nanahoshi',
    'Heewon Entertainment',
    'KUAIYING',
    '7doc',
    'Marvelous Entertainment',
    'The Monk Studios',
    'Maten Animation',
    'Painted Edge',
    'Saber Project',
    'Sunny Side Up',
    'Dentsu',
    'MASTER LIGHTS',
    'Remic',
    'Mook Animation',
    'BigBigSun',
    'Arcs Create',
    'High Energy',
    'Kitty Film Mitaka',
    'CCTV Animation',
    'Studio Gram',
    'Point Pictures',
    'Hero Communication',
    'Choirock',
    'Steve N\' Steven',
    'YAMATOWORKS',
    'Magia Doraglier',
    'Half H.P',
    'Wako Productions',
    'Grouper Productions',
    'Guton Animation',
    'Ascension',
    'Jinni\'s Animation Studios',
    'Atoonz',
    'Studio Polon',
    'Plus Heads',
    'Studio Crocodile',
    'MOJO',
    'Coloroom Pictures',
    'Star Hunter Animation',
    'Nice Boat Animation',
    'Joker Films',
    'Alfred Imageworks',
    'AIC Frontier',
    'Fuji TV',
    'Victor Entertainment',
    'Shanghai Hippo Animation',
    'Chosen',
    'Adonero',
    'Next Media Animation',
    'Wan Wei Mao Donghua',
    'SAFEHOUSE',
    'TRCARTOON',
    'Office AO',
    'I.G Zwei',
    'Hiro Media',
    'Colored Pencil Animation Japan',
    'Shuiniu Dongman',
    'Studio Kafka',
    'TAP',
    '81 Produce',
    'Lingsanwu Animation',
    'Animate',
    'Saiji',
    'Helo',
    'SEK Studios',
    'Cocktail Media',
    'Studio Unicorn',
    'Studio Zero',
    'CUKA',
    'Silver',
    'Stingray',
    'Shengguang Knight Culture',
    'Ishimori Entertainment',
    'CLOUDHEARTS',
    'Shinkuukan',
    'Shochiku Animation Institute',
    'Tsuchida Productions',
    'Marone',
    'Bilibili',
    'Tong Ming Xuan',
    'Acca effe',
    'Yi Chen Animation',
    'Romanov Films',
    'Maroyaka',
    'Office DCI',
    'Youliao',
    'Yamamura Animation, Inc.',
    'LMD',
    'Tengu Kobou',
    'Qingxiang',
    'Aniplex',
    'Pure Arts',
    'PrimeTime',
    'OLM Digital',
    'Toho Company',
    'RAMS',
    'Urban Product',
    'Charaction',
    'Pili International Multimedia',
    'Dancing CG',
    'P.I.C.S.',
    'Poncotan',
    'Live2D Creative',
    'KeyEast',
    'Comic Animation',
    'Ichigo Animation',
    'Kids Station',
    'Strawberry Meets Pictures',
    'Sentai Filmworks',
    'Studio Pastoral',
    'Office Nobu',
    'Kate Arrow',
    'Imagica Imageworks',
    'Robot Communications',
    'Starchild Records',
    'XFLAG Pictures',
    'Crunchyroll',
    'G-angle',
    'Studio World',
    'Studio Ranmaru',
    'Primastea',
    'Studio Outrigger',
    'Studio Dadashow',
    'Karaku',
    'HS Pictures',
    'Annapuru',
    'Bigcat',
    'Egg',
    'Rising Force',
    'Opera House',
    'Studio Egg',
    'CGCG Inc.',
    'Qubic Pictures',
    'Rainbridge Animation',
    'Wulifang Animation',
    'Kuri Jikken Manga Kobo',
    'Giga Production',
    'Studio Eight Color',
    'Soket',
    'AIC Classic',
    'Escape Velocity Animation',
    'Exsa',
    'Tohokushinsha Film Corporation',
    'Kigumi',
    'Studio Z5',
    'Team Till Dawn',
    'Wanhe Huyu',
    'Life Work',
    'Echoes',
    'Purple Cow Japan',
    'Twilight',
    'Oddjob',
    'Thunder River',
    'Creative Bridge',
    'Kyokuichi Tokyo Movie Shinsha',
    'San-X',
    'ManHoo Culture',
    'Windy',
    'Shimogumi',
    'Planet',
    'FILMONY',
    'Dawn Picture',
    'Bibury Animation CG',
    'Shanghai Foch Film and TV Culture Investment',
    'Discotek',
    'Rastar',
    'TV Aichi',
    'Marine Entertainment',
    'Sega Games',
    'Tencent Penguin Pictures',
    'Arcturus',
    'Media Blasters',
    'MontBlanc Pictures',
    'Nippon Columbia',
    'XEBEC M2',
    'View Works',
    'Gambit',
    'Shanghai Foch Film Culture Investment',
    'Dangun Pictures',
    'Studio Flag',
    'Visual 80',
    'Mokai Technology',
    'IDRAGONS Creative',
    'FUNimation Entertainment',
    'Kitty Films',
    'Animation 21',
    'Panmedia',
    'Space Shell',
    'Oxybot',
    'KIO',
    'Medo',
    'Maikaze',
    'Creators Dot Com',
    'Sony Music Entertainment',
    'Hangzhou Shimei Pictures',
    'FLAGSHIP LINE',
    'Cloud Culture',
    'Filmlink International',
    'Omnibus Japan',
    'Lyrics',
    'NEXT Animation',
    'Advance Syakujii',
    'ONIRO',
    'Studio! Cucuri',
    'Studio Gazelle',
    'Japan Taps',
    'Soda Bear Animation',
    'Studio Meditation With a Pencil',
    'Qianqi Cartoon',
    'Heartbit',
    'Xuni Ying Ye',
    '10Gauge',
    'JM Animation',
    'BITGANG',
    'Yudubai Animation',
    'VAP',
    'The Right Stuf International',
    'Wired',
    'Bandai Visual',
    'Rikuentai',
    'Studio 88',
    'IKEAnimations',
    'REALTHING',
    'Jade Animation',
    'Nihon Ad Systems',
    'Sanctuary',
    'Asura Film',
    'Wulifang',
    'Year Young Culture',
    'Glovision',
    'BooKong Culture',
    'AtelierPontdarc',
    'SAFEHOUSE Inc.',
    'IMAGICA DIGITALSCAPE',
    'Yixiang Culture',
    'Yell',
    'OLM Team Yoshioka',
    'Orcen',
    'Cyclone Graphics',
    'Tsubasa Production',
    'Wenzhou Mengbu Anime Design',
    'Origin Chasing',
    'ARECT',
    'Zhangyue Pictures',
    'MAT',
    'XFLAG',
    'Hua Dream',
    'Daewon Media',
    'Shanghai Motion Magic',
    'Dynamic Planning',
    'Visual Persistence',
    'HuaDream',
    'Green Ooita',
    'Gainax Kyoto',
    'Shenying Animation',
    'Mimoid',
    'BlueArc Animation',
    'Xanthus Media',
    'AIC Takarazuka',
    'White Paper Animation',
    'Hot Zipang',
    'Assez Finaud Fabric',
    'Thymos Media',
    'Skouras',
    'Broccoli',
    'Helo.inc',
    'Network Kouenji',
    'Manga Entertainment',
    'KOO-KI',
    'Blue Cat',
    'Sugar Boy',
    'Yonago Gainax',
    'Keica',
    'Creators in Pack TOKYO',
    'Kenji',
    'EBS',
    'Beijing Rocen Digital',
    'Chongliyuhua',
    'EMI',
    'Tokyo Media Connections',
    '717',
    'SAMG Entertainment',
    'Quyue Technology',
    'SamBakZa',
    'Brio Animation',
    'Musashino Art University',
    'Yomiko Advertising',
    'SJYNEXCUS',
    'Yamato Works',
    'Cinepix',
    'Studio Nue',
    'Tanglin Culture',
    'AIC PLUS+',
    'Production +h.',
    'G.CMay Animation & Film',
    'E&G Films',
    'B&T',
    'He Zhou Culture',
    'Dongwoo A&E',
    'G&G Entertainment',
    'Anima&Co.',
    'One & All Animation',
    'Kun Animation & Comic',
    'Shogakukan Music & Digital Entertainment',
    'Public & Basic'
];
    
    res.json({ genres, tags, studios: studio });
});

app.get(/^(?!(\/api|\/profile_pics)).*$/, (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log(`Application available at: http://localhost:3000`);
});
