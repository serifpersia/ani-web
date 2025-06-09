const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const { parseString } = require('xml2js');
const app = express();
const port = 3000;

const db = new sqlite3.Database('anime.db', (err) => {
    if (err) console.error('Database error:', err.message);
    else console.log('Connected to SQLite database.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS watchlist (id TEXT PRIMARY KEY, name TEXT, thumbnail TEXT, status TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS watched_episodes (showId TEXT, episodeNumber TEXT, watchedAt DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (showId, episodeNumber))`);
    db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS shows_meta (id TEXT PRIMARY KEY, name TEXT, thumbnail TEXT)`);
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

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
      availableEpisodesDetail
    }
  }
}
`;

async function fetchAndSendShows(res, variables) {
    try {
        const response = await axios.get(apiEndpoint, {
            headers: {
                'User-Agent': userAgent,
                'Referer': referer
            },
            params: {
                query: showsQuery,
                variables: JSON.stringify(variables)
            },
            timeout: 15000
        });
        const shows = response.data?.data?.shows?.edges || [];
        const transformedShows = shows.map(show => ({
            ...show,
            thumbnail: deobfuscateUrl(show.thumbnail || '')
        }));
        res.json(transformedShows);
    } catch (error) {
        console.error('Error fetching data:', error.message);
        res.status(500).send('Error fetching data');
    }
}

const popularQueryHash = "1fc9651b0d4c3b9dfd2fa6e1d50b8f4d11ce37f988c23b8ee20f82159f7c1147";

app.get('/popular/:timeframe', async (req, res) => {
    const timeframe = req.params.timeframe.toLowerCase();
    let dateRange;
    switch (timeframe) {
        case 'daily': dateRange = 1; break;
        case 'weekly': dateRange = 7; break;
        case 'monthly': dateRange = 30; break;
        case 'all': dateRange = 0; break;
        default: return res.status(400).send('Invalid timeframe.');
    }

    const variables = {
        type: "anime",
        size: 10,
        page: 1,
        allowAdult: false,
        allowUnknown: false,
        dateRange: dateRange
    };

    const extensions = {
        persistedQuery: {
            version: 1,
            sha256Hash: popularQueryHash
        }
    };

    try {
        const response = await axios.get(apiEndpoint, {
            headers: { 'User-Agent': userAgent, 'Referer': referer },
            params: {
                variables: JSON.stringify(variables),
                extensions: JSON.stringify(extensions)
            },
            timeout: 15000
        });

        const recommendations = response.data?.data?.queryPopular?.recommendations || [];
        
        const shows = recommendations.map(rec => {
            const card = rec.anyCard;
            return {
                ...card,
                thumbnail: deobfuscateUrl(card.thumbnail || '')
            };
        });

        res.json(shows);
    } catch (error) {
        console.error('Error fetching popular data:', error.response ? error.response.data : error.message);
        res.status(500).send('Error fetching popular data');
    }
});

app.get('/latest-releases', (req, res) => {
    const variables = {
        search: {
            sortBy: 'Latest_Update',
            allowAdult: false
        },
        limit: 10,
        page: 1,
        translationType: 'sub',
        countryOrigin: 'JP'
    };
    fetchAndSendShows(res, variables);
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
	const variables = {
		search: {
			year,
			season,
			sortBy: "Latest_Update",
			allowAdult: false
		},
		limit: 25,
		page: parseInt(req.query.page) || 1,
		translationType: "sub",
		countryOrigin: "JP"
	};
	fetchAndSendShows(res, variables);
});

app.get('/search', (req, res) => {
    const { query, season, year, sortBy, page, type, country, translation } = req.query;
    const searchObj = {
        allowAdult: false
    };
    if (query) searchObj.query = query;
    if (season && season !== 'ALL') searchObj.season = season;
    if (year && year !== 'ALL') searchObj.year = parseInt(year);
    if (sortBy) searchObj.sortBy = sortBy;
    if (type && type !== 'ALL') searchObj.types = [type];

    const variables = {
        search: searchObj,
        limit: 28,
        page: parseInt(page) || 1,
        translationType: (translation && translation !== 'ALL') ? translation : 'sub',
        countryOrigin: (country && country !== 'ALL') ? country : 'ALL'
    };
    fetchAndSendShows(res, variables);
});

app.get('/schedule/:date', (req, res) => {
    const dateStr = req.params.date;
    const requestedDate = new Date(dateStr + 'T00:00:00.000Z');

    if (isNaN(requestedDate)) {
        return res.status(400).send('Invalid date format. Use YYYY-MM-DD.');
    }

    const startOfDay = new Date(requestedDate);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(requestedDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const variables = {
        search: {
            dateRangeStart: Math.floor(startOfDay.getTime() / 1000),
            dateRangeEnd: Math.floor(endOfDay.getTime() / 1000),
            sortBy: "Latest_Update"
        },
        limit: 50,
        page: 1,
        translationType: "sub",
        countryOrigin: "ALL"
    };
    fetchAndSendShows(res, variables);
});

app.get('/show-meta/:id', async (req, res) => {
    const showId = req.params.id;
    try {
        const response = await axios.get(apiEndpoint, {
            headers: { 'User-Agent': userAgent, 'Referer': referer },
            params: {
                query: `query($showId: String!) { show(_id: $showId) { name, thumbnail } }`,
                variables: JSON.stringify({ showId })
            },
            timeout: 15000
        });
        const show = response.data.data.show;
        if (show) {
            res.json({
                name: show.name,
                thumbnail: deobfuscateUrl(show.thumbnail)
            });
        } else {
            res.status(404).json({ error: 'Show not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch show metadata' });
    }
});


app.get('/episodes', async (req, res) => {
    const { showId, mode = 'sub' } = req.query;
    try {
        const response = await axios.get(apiEndpoint, {
            headers: {
                'User-Agent': userAgent,
                'Referer': referer
            },
            params: {
                query: `query($showId: String!) { show(_id: $showId) { availableEpisodesDetail, description } }`,
                variables: JSON.stringify({ showId })
            },
            timeout: 15000
        });
        const showData = response.data.data.show;
        res.json({
            episodes: showData.availableEpisodesDetail[mode] || [],
            description: showData.description
        });
    } catch (error) {
        res.status(500).send('Error fetching episodes from API');
    }
});

app.get('/video', async (req, res) => {
	const {
		showId,
		episodeNumber,
		mode = 'sub'
	} = req.query;
	const graphqlQuery = `query($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode(showId: $showId, translationType: $translationType, episodeString: $episodeString) { sourceUrls } }`;
	try {
		const {
			data
		} = await axios.get(apiEndpoint, {
			headers: {
				'User-Agent': userAgent,
				'Referer': referer
			},
			params: {
				query: graphqlQuery,
				variables: JSON.stringify({
					showId,
					translationType: mode,
					episodeString: episodeNumber
				})
			},
			timeout: 15000
		});
		const sources = data.data.episode.sourceUrls.filter(s => s.sourceUrl.startsWith('--')).sort((a, b) => b.priority - a.priority);
		const availableSources = [];
		for (const source of sources) {
			try {
				let decryptedUrl = "PLACEHOLDER_DECRYPT_FUNCTION";
				decryptedUrl = (s => {
					const m = DEOBFUSCATION_MAP;
					let d = '';
					for (let i = 0; i < s.length; i += 2) d += m[s.substring(i, i + 2)] || s.substring(i, i + 2);
					return d.includes('/clock') && !d.includes('.json') ? d.replace('/clock', '/clock.json') : d;
				})(source.sourceUrl.substring(2)).replace(/([^:]\/)\/+/g, "$1");
				let videoLinks = [];
				let subtitles = [];
				if (decryptedUrl.includes('/clock.json')) {
					const finalUrl = new URL(decryptedUrl, apiBaseUrl).href;
					const {
						data: clockData
					} = await axios.get(finalUrl, {
						headers: {
							'Referer': referer,
							'User-Agent': userAgent
						},
						timeout: 10000
					});
					if (clockData.links && clockData.links.length > 0) {
						videoLinks = clockData.links[0].hls ? await (async (u, h) => {
							try {
								const {
									data: d
								} = await axios.get(u, {
									headers: h,
									timeout: 10000
								});
								const l = d.split('\n'),
									q = [];
								for (let i = 0; i < l.length; i++)
									if (l[i].startsWith('#EXT-X-STREAM-INF')) {
										const rM = l[i].match(/RESOLUTION=\d+x(\d+)/);
										q.push({
											resolutionStr: rM ? `${rM[1]}p` : 'Auto',
											link: new URL(l[i + 1], u).href,
											hls: true,
											headers: h
										});
									} return q.length > 0 ? q : [{
									resolutionStr: 'auto',
									link: u,
									hls: true,
									headers: h
								}];
							} catch (e) {
								return [];
							}
						})(clockData.links[0].link, clockData.links[0].headers) : clockData.links;
						subtitles = clockData.links[0].subtitles || [];
					}
				} else {
					videoLinks.push({
						link: decryptedUrl,
						resolutionStr: 'default',
						hls: decryptedUrl.includes('.m3u8'),
						headers: {
							Referer: referer
						}
					});
				}
				if (videoLinks.length > 0) {
					availableSources.push({
						sourceName: source.sourceName,
						links: videoLinks,
						subtitles
					});
				}
			} catch (e) {}
		}
		if (availableSources.length > 0) res.json(availableSources);
		else res.status(404).send('No playable video URLs found.');
	} catch (e) {
		res.status(500).send(`Error fetching video data: ${e.message}`);
	}
});

app.get('/image-proxy', async (req, res) => {
    try {
        const { data } = await axios({
            method: 'get',
            url: req.query.url,
            responseType: 'stream',
            headers: {
                Referer: apiBaseUrl,
                'User-Agent': userAgent
            },
            timeout: 10000
        });
        data.pipe(res);
    } catch (e) {
        res.sendFile(__dirname + '/public/placeholder.png');
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
        if (url.includes('.m3u8')) {
            const response = await axios.get(url, {
                headers,
                responseType: 'text',
                timeout: 15000
            });
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
            res.set(streamResponse.headers);
            streamResponse.data.pipe(res);
        }
    } catch (e) {
        res.status(500).send(`Proxy error: ${e.message}`);
    }
});

app.get('/subtitle-proxy', async (req, res) => {
    const { url } = req.query;
    try {
        const response = await axios.get(url, {
            responseType: 'text',
            timeout: 10000
        });
        res.set('Content-Type', 'text/vtt; charset=utf-8');
        res.send(response.data);
    } catch (error) {
        res.status(500).send(`Proxy error: ${error.message}`);
    }
});

app.post('/import/mal-xml', async (req, res) => {
    const { xml, erase } = req.body;
    if (!xml) {
        return res.status(400).json({ error: 'XML content is required' });
    }

    if (erase) {
        await new Promise((resolve, reject) => {
            db.run(`DELETE FROM watchlist`, [], (err) => {
                if (err) reject(new Error('DB error on erase.'));
                else resolve();
            });
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
                    params: {
                        query: showsQuery,
                        variables: JSON.stringify({ search: { query: title }, limit: 1 })
                    },
                    timeout: 5000
                });

                const foundShow = searchResponse.data?.data?.shows?.edges[0];
                if (foundShow) {
                    await new Promise((resolve, reject) => {
                        db.run(`INSERT OR REPLACE INTO watchlist (id, name, thumbnail, status) VALUES (?, ?, ?, ?)`,
                            [foundShow._id, foundShow.name, deobfuscateUrl(foundShow.thumbnail), malStatus],
                            (err) => {
                                if (err) reject(err);
                                else {
                                    importedCount++;
                                    resolve();
                                }
                            }
                        );
                    });
                } else {
                    skippedCount++;
                }
            } catch (searchError) {
                skippedCount++;
            }
        }
        res.json({ imported: importedCount, skipped: skippedCount });
    });
});

app.post('/watchlist/add', (req, res) => {
    const { id, name, thumbnail, status } = req.body;
    db.run(`INSERT OR REPLACE INTO watchlist (id, name, thumbnail, status) VALUES (?, ?, ?, ?)`, 
        [id, name, thumbnail, status || 'Watching'], 
        (err) => err ? res.status(500).send('DB error') : res.json({ success: true })
    );
});

app.get('/watchlist/check/:showId', (req, res) => {
    db.get('SELECT EXISTS(SELECT 1 FROM watchlist WHERE id = ?) as inWatchlist', 
        [req.params.showId], 
        (err, row) => err ? res.status(500).send('DB error') : res.json({ inWatchlist: !!row.inWatchlist })
    );
});

app.post('/watchlist/status', (req, res) => {
    const { id, status } = req.body;
    db.run(`UPDATE watchlist SET status = ? WHERE id = ?`, 
        [status, id], 
        (err) => err ? res.status(500).json({ error: 'DB error' }) : res.json({ success: true })
    );
});

app.get('/watchlist', (req, res) => {
    db.all(`SELECT * FROM watchlist ORDER BY name ASC`, [], 
        (err, rows) => err ? res.status(500).send('DB error') : res.json(rows)
    );
});

app.post('/watchlist/remove', (req, res) => {
    db.run(`DELETE FROM watchlist WHERE id = ?`, 
        [req.body.id], 
        (err) => err ? res.status(500).send('DB error') : res.json({ success: true })
    );
});

app.post('/watched-episode', (req, res) => {
    const { showId, episodeNumber, showName, showThumbnail } = req.body;
    db.serialize(() => {
        db.run('INSERT OR IGNORE INTO shows_meta (id, name, thumbnail) VALUES (?, ?, ?)', 
            [showId, showName, deobfuscateUrl(showThumbnail)]);
        db.run(`INSERT OR REPLACE INTO watched_episodes (showId, episodeNumber, watchedAt) VALUES (?, ?, CURRENT_TIMESTAMP)`, 
            [showId, episodeNumber], 
            (err) => err ? res.status(500).send('DB error') : res.json({ success: true })
        );
    });
});

app.get('/watched-episodes/:showId', (req, res) => {
    db.all(`SELECT episodeNumber FROM watched_episodes WHERE showId = ?`, 
        [req.params.showId], 
        (err, rows) => err ? res.status(500).send('DB error') : res.json(rows.map(r => r.episodeNumber))
    );
});

app.get('/continue-watching', (req, res) => {
    const query = `
        SELECT sm.id, sm.name, sm.thumbnail, 
               (SELECT we.episodeNumber FROM watched_episodes we WHERE we.showId = sm.id 
                ORDER BY CAST(we.episodeNumber AS REAL) DESC, we.watchedAt DESC LIMIT 1) as lastWatchedEpisode 
        FROM shows_meta sm 
        JOIN (SELECT showId, MAX(watchedAt) as maxWatchedAt FROM watched_episodes GROUP BY showId) as latest_watches 
        ON sm.id = latest_watches.showId 
        ORDER BY latest_watches.maxWatchedAt DESC LIMIT 10;
    `;
    db.all(query, [], async (err, rows) => {
        if (err) return res.status(500).send('DB error');
        try {
            const results = await Promise.all(rows.map(async (show) => {
                if (!show.lastWatchedEpisode) return null;
                const epResponse = await axios.get(apiEndpoint, {
                    headers: {
                        'User-Agent': userAgent,
                        'Referer': referer
                    },
                    params: {
                        query: `query($showId: String!) { show(_id: $showId) { availableEpisodesDetail } }`,
                        variables: JSON.stringify({ showId: show.id })
                    },
                    timeout: 10000
                });
                const allEps = epResponse.data.data.show.availableEpisodesDetail.sub?.sort((a, b) => parseFloat(a) - parseFloat(b)) || [];
                const lastWatchedIndex = allEps.indexOf(show.lastWatchedEpisode);
                if (lastWatchedIndex > -1 && lastWatchedIndex < allEps.length) {
                    return {
                        showId: show.id,
                        name: show.name,
                        thumbnail: deobfuscateUrl(show.thumbnail),
                        nextEpisodeNumber: allEps[lastWatchedIndex],
                        availableEpisodesDetail: epResponse.data.data.show.availableEpisodesDetail
                    };
                }
                return null;
            }));
            res.json(results.filter(Boolean));
        } catch (apiError) {
            res.status(500).send('API error');
        }
    });
});

app.get('/settings/:key', (req, res) => {
    db.get('SELECT value FROM settings WHERE key = ?', 
        [req.params.key], 
        (err, row) => {
            if (err) return res.status(500).json({ error: 'DB error' });
            res.json({ value: row ? row.value : null });
        }
    );
});

app.post('/settings', (req, res) => {
    const { key, value } = req.body;
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 
        [key, value], 
        (err) => {
            if (err) return res.status(500).json({ error: 'DB error' });
            res.json({ success: true });
        }
    );
});

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));