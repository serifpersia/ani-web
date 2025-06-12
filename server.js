const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const { parseString } = require('xml2js');
const NodeCache = require('node-cache');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;
const apiCache = new NodeCache({ stdTTL: 3600 });
const dbPath = path.join(__dirname, 'anime.db');
let db;

const profilePicsDir = path.join(__dirname, 'public', 'profile_pics');
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

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
app.get('/favicon.ico', (req, res) => res.status(204).send());
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
    if (!obfuscatedUrl.startsWith('--') && obfuscatedUrl.includes('s4.anilist.co')) {
        return obfuscatedUrl.replace('https://s4.anilist.co', 'https://wp.youtube-anime.com/s4.anilist.co');
    }
    if (obfuscatedUrl.startsWith('--')) {
        obfuscatedUrl = obfuscatedUrl.slice(2);
        let deobfuscated = '';
        for (let i = 0; i < obfuscatedUrl.length; i += 2) {
            const chunk = obfuscatedUrl.substring(i, i + 2);
            deobfuscated += DEOBFUSCATION_MAP[chunk] || chunk;
        }
        if (deobfuscated.startsWith('/')) {
            return `https://wp.youtube-anime.com${deobfuscated}`;
        }
        return deobfuscated;
    }
    return obfuscatedUrl;
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
async function fetchAndSendShows(res, variables, cacheKey) {
    if (cacheKey && apiCache.has(cacheKey)) {
        return res.json(apiCache.get(cacheKey));
    }
    try {
        const response = await axios.get(apiEndpoint, {
            headers: { 'User-Agent': userAgent, 'Referer': referer },
            params: { query: showsQuery, variables: JSON.stringify(variables) },
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
        res.json(transformedShows);
    } catch (error) {
        console.error('Error fetching data:', error.message);
        res.status(500).send('Error fetching data');
    }
}
const popularQueryHash = "1fc9651b0d4c3b9dfd2fa6e1d50b8f4d11ce37f988c23b8ee20f82159f7c1147";
app.get('/popular/:timeframe', async (req, res) => {
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
        res.json(shows);
    } catch (error) {
        console.error('Error fetching popular data:', error.response ? error.response.data : error.message);
        res.status(500).send('Error fetching popular data');
    }
});
app.get('/latest-releases', (req, res) => {
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
app.get('/seasonal', (req, res) => {
	const season = getCurrentAnimeSeason();
	const year = new Date().getFullYear();
    const page = parseInt(req.query.page) || 1;
	const variables = { search: { year, season, sortBy: "Latest_Update", allowAdult: false }, limit: 25, page: page, translationType: "sub", countryOrigin: "JP" };
    const cacheKey = `seasonal-${season}-${year}-p${page}`;
	fetchAndSendShows(res, variables, cacheKey);
});
app.get('/search', (req, res) => {
    const { query, season, year, sortBy, page, type, country, translation } = req.query;
    const searchObj = { allowAdult: false };
    if (query) searchObj.query = query;
    if (season && season !== 'ALL') searchObj.season = season;
    if (year && year !== 'ALL') searchObj.year = parseInt(year);
    if (sortBy) searchObj.sortBy = sortBy;
    if (type && type !== 'ALL') searchObj.types = [type];
    const variables = { search: searchObj, limit: 28, page: parseInt(page) || 1, translationType: (translation && translation !== 'ALL') ? translation : 'sub', countryOrigin: (country && country !== 'ALL') ? country : 'ALL' };
    fetchAndSendShows(res, variables, null);
});
app.get('/schedule/:date', (req, res) => {
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
app.get('/show-meta/:id', async (req, res) => {
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
            res.json(meta);
        } else {
            res.status(404).json({ error: 'Show not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch show metadata' });
    }
});
app.get('/episodes', async (req, res) => {
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
        res.json(result);
    } catch (error) {
        res.status(500).send('Error fetching episodes from API');
    }
});

app.get('/video', async (req, res) => {
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
					videoLinks.push({ link: decryptedUrl, resolutionStr: 'default', hls: decryptedUrl.includes('.m3u8'), headers: { Referer: referer } });
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

app.get('/image-proxy', async (req, res) => {
    try {
        const { data, headers } = await axios({
            method: 'get',
            url: req.query.url,
            responseType: 'stream',
            headers: { Referer: apiBaseUrl, 'User-Agent': userAgent },
            timeout: 10000
        });
        res.set('Cache-Control', 'public, max-age=604800, immutable');
        res.set('Content-Type', headers['content-type']);
        data.pipe(res);
    } catch (e) {
        res.status(500).sendFile(path.join(__dirname, '/public/placeholder.png'));
    }
});

app.get('/proxy', async (req, res) => {
    const { url, referer: dynamicReferer } = req.query;
    try {
        const headers = { 
            'User-Agent': userAgent, 
            'Accept': '*/*' 
        };
        if (dynamicReferer) headers['Referer'] = dynamicReferer;

        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        if (url.includes('.m3u8')) {
            const response = await axios.get(url, { headers, responseType: 'text', timeout: 15000 });
            const baseUrl = new URL(url);
            const rewritten = response.data.split('\n').map(l =>
                (l.trim().length > 0 && !l.startsWith('#'))
                    ? `/proxy?url=${encodeURIComponent(new URL(l, baseUrl).href)}&referer=${encodeURIComponent(dynamicReferer || referer)}`
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
            res.set({
                'Content-Range': streamResponse.headers['content-range'],
                'Content-Length': streamResponse.headers['content-length'],
                'Accept-Ranges': streamResponse.headers['accept-ranges'],
                'Content-Type': streamResponse.headers['content-type'],
            });

            streamResponse.data.pipe(res);
        }
    } catch (e) {
        if (e.response) {
            console.error(`Proxy error for ${url}: Status ${e.response.status}`);
            res.status(e.response.status).send(`Proxy error: ${e.message}`);
        } else {
            console.error(`Proxy error for ${url}: ${e.message}`);
            res.status(500).send(`Proxy error: ${e.message}`);
        }
    }
});

app.get('/subtitle-proxy', async (req, res) => {
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

app.get('/schedule-info/:showId', async (req, res) => {
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
        console.error("Error fetching schedule info:", error.message);
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

app.post('/import/mal-xml', async (req, res) => {
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
app.post('/watchlist/add', (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });
    const { id, name, thumbnail, status } = req.body;
    const finalThumbnail = deobfuscateUrl(thumbnail || '');
    db.run(`INSERT OR REPLACE INTO watchlist (profile_id, id, name, thumbnail, status) VALUES (?, ?, ?, ?, ?)`,
        [profileId, id, name, finalThumbnail, status || 'Watching'],
        (err) => err ? res.status(500).json({ error: 'DB error' }) : res.json({ success: true })
    );
});
app.get('/watchlist/check/:showId', (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });
    db.get('SELECT EXISTS(SELECT 1 FROM watchlist WHERE profile_id = ? AND id = ?) as inWatchlist',
        [profileId, req.params.showId],
        (err, row) => err ? res.status(500).json({ error: 'DB error' }) : res.json({ inWatchlist: !!row.inWatchlist })
    );
});
app.post('/watchlist/status', (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });
    const { id, status } = req.body;
    db.run(`UPDATE watchlist SET status = ? WHERE profile_id = ? AND id = ?`,
        [status, profileId, id],
        (err) => err ? res.status(500).json({ error: 'DB error' }) : res.json({ success: true })
    );
});
app.get('/watchlist', (req, res) => {
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
app.post('/watchlist/remove', (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });
    db.run(`DELETE FROM watchlist WHERE profile_id = ? AND id = ?`,
        [profileId, req.body.id],
        (err) => err ? res.status(500).json({ error: 'DB error' }) : res.json({ success: true })
    );
});

app.post('/update-progress', (req, res) => {
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

app.get('/episode-progress/:showId/:episodeNumber', (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });
    const { showId, episodeNumber } = req.params;

    db.get('SELECT currentTime, duration FROM watched_episodes WHERE profile_id = ? AND showId = ? AND episodeNumber = ?',
        [profileId, showId, episodeNumber], (err, row) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json(row || { currentTime: 0, duration: 0 });
    });
});

app.get('/watched-episodes/:showId', (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });
    db.all(`SELECT episodeNumber FROM watched_episodes WHERE profile_id = ? AND showId = ?`,
        [profileId, req.params.showId],
        (err, rows) => err ? res.status(500).json({ error: 'DB error' }) : res.json(rows.map(r => r.episodeNumber))
    );
});

app.get('/continue-watching', (req, res) => {
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

                    if (lastWatchedIndex > -1 && lastWatchedIndex < allEps.length - 1) {
                        return {
                            ...show,
                            thumbnail: deobfuscateUrl(show.thumbnail),
                            episodeToPlay: allEps[lastWatchedIndex + 1],
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


app.get('/skip-times/:showId/:episodeNumber', async (req, res) => {
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

app.post('/continue-watching/remove', (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });
    const { showId } = req.body;
    db.run(`DELETE FROM watched_episodes WHERE profile_id = ? AND showId = ?`,
        [profileId, showId],
        (err) => err ? res.status(500).json({ error: 'DB error' }) : res.json({ success: true })
    );
});

app.get('/settings/:key', (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });
    db.get('SELECT value FROM settings WHERE profile_id = ? AND key = ?', [profileId, req.params.key], (err, row) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ value: row ? row.value : null });
    });
});
app.post('/settings', (req, res) => {
    const profileId = req.headers['x-profile-id'];
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required' });
    const { key, value } = req.body;
    db.run('INSERT OR REPLACE INTO settings (profile_id, key, value) VALUES (?, ?, ?)', [profileId, key, value], (err) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ success: true });
    });
});
app.get('/backup-db', (req, res) => {
   res.download(dbPath, 'ani-web-backup.db', (err) => {
      if (err) {
         console.error("Error sending database file:", err);
         res.status(500).send("Could not backup database.");
      }
   });
});
app.post('/restore-db', dbUpload.single('dbfile'), (req, res) => {
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
app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
