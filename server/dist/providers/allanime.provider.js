"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllAnimeProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../logger"));
const cheerio = __importStar(require("cheerio"));
const API_BASE_URL = 'https://allanime.day';
const API_ENDPOINT = `https://api.allanime.day/api`;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0';
const REFERER = 'https://allmanga.to';
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
class AllAnimeProvider {
    constructor(cache) {
        this.name = 'AllAnime';
        this.cache = cache;
    }
    deobfuscateUrl(obfuscatedUrl) {
        if (!obfuscatedUrl)
            return '';
        let finalUrl = obfuscatedUrl;
        if (!obfuscatedUrl.startsWith('--') && obfuscatedUrl.includes('s4.anilist.co')) {
            finalUrl = obfuscatedUrl.replace('https://s4.anilist.co', 'https://wp.youtube-anime.com/s4.anilist.co');
        }
        else if (obfuscatedUrl.startsWith('--')) {
            obfuscatedUrl = obfuscatedUrl.slice(2);
            let deobfuscated = '';
            for (let i = 0; i < obfuscatedUrl.length; i += 2) {
                const chunk = obfuscatedUrl.substring(i, i + 2);
                deobfuscated += DEOBFUSCATION_MAP[chunk] || chunk;
            }
            if (deobfuscated.startsWith('/')) {
                finalUrl = `https://wp.youtube-anime.com${deobfuscated}`;
            }
            else {
                finalUrl = deobfuscated;
            }
        }
        if (finalUrl.startsWith('http://') || finalUrl.startsWith('https://')) {
            return finalUrl;
        }
        return finalUrl;
    }
    async _fetchShows(variables, extensions) {
        const params = { variables: JSON.stringify(variables) };
        if (extensions) {
            params.extensions = JSON.stringify(extensions);
        }
        else {
            params.query = `
            query ($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) {
              shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) {
                edges { _id name nativeName englishName thumbnail description type availableEpisodesDetail }
              }
            }`;
        }
        const response = await axios_1.default.get(API_ENDPOINT, {
            headers: { 'User-Agent': USER_AGENT, 'Referer': REFERER },
            params,
            timeout: 15000
        });
        const shows = response.data?.data?.shows?.edges || [];
        return shows.map((show) => ({
            ...show,
            thumbnail: this.deobfuscateUrl(show.thumbnail || '')
        }));
    }
    async search(options) {
        const { query, season, year, sortBy, page, type, country, translation, genres, excludeGenres, tags, excludeTags, studios } = options;
        const searchObj = { allowAdult: false };
        if (query)
            searchObj.query = query;
        if (season && season !== 'ALL')
            searchObj.season = season;
        if (year && year !== 'ALL')
            searchObj.year = parseInt(year);
        if (sortBy)
            searchObj.sortBy = sortBy;
        if (type && type !== 'ALL')
            searchObj.types = [type];
        if (genres)
            searchObj.genres = genres.split(',');
        if (excludeGenres)
            searchObj.excludeGenres = excludeGenres.split(',');
        if (tags)
            searchObj.tags = tags.split(',');
        if (studios)
            searchObj.studios = studios.split(',');
        if (excludeTags)
            searchObj.excludeTags = excludeTags.split(',');
        const variables = { search: searchObj, limit: 28, page: parseInt(page) || 1, translationType: (translation && translation !== 'ALL') ? translation : 'sub', countryOrigin: (country && country !== 'ALL') ? country : 'ALL' };
        const extensions = {
            persistedQuery: {
                version: 1,
                sha256Hash: "06327bc10dd682e1ee7e07b6db9c16e9ad2fd56c1b769e47513128cd5c9fc77a"
            }
        };
        return this._fetchShows(variables, extensions);
    }
    async getPopular(timeframe) {
        let dateRange;
        switch (timeframe) {
            case 'daily':
                dateRange = 1;
                break;
            case 'weekly':
                dateRange = 7;
                break;
            case 'monthly':
                dateRange = 30;
                break;
            case 'all':
                dateRange = 0;
                break;
        }
        const variables = { type: "anime", size: 10, page: 1, allowAdult: false, allowUnknown: false, dateRange: dateRange };
        const extensions = { persistedQuery: { version: 1, sha256Hash: "1fc9651b0d4c3b9dfd2fa6e1d50b8f4d11ce37f988c23b8ee20f82159f7c1147" } };
        const response = await axios_1.default.get(API_ENDPOINT, {
            headers: { 'User-Agent': USER_AGENT, 'Referer': REFERER },
            params: { variables: JSON.stringify(variables), extensions: JSON.stringify(extensions) },
            timeout: 15000
        });
        const recommendations = response.data?.data?.queryPopular?.recommendations || [];
        return recommendations.map((rec) => {
            const card = rec.anyCard;
            return { ...card, thumbnail: this.deobfuscateUrl(card.thumbnail || '') };
        });
    }
    async getSchedule(date) {
        const startOfDay = new Date(date);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setUTCHours(23, 59, 59, 999);
        const variables = { search: { dateRangeStart: Math.floor(startOfDay.getTime() / 1000), dateRangeEnd: Math.floor(endOfDay.getTime() / 1000), sortBy: "Latest_Update" }, limit: 50, page: 1, translationType: "sub", countryOrigin: "ALL" };
        return this._fetchShows(variables);
    }
    async getSeasonal(page) {
        const month = new Date().getMonth();
        const season = (month >= 0 && month <= 2) ? "Winter" : (month >= 3 && month <= 5) ? "Spring" : (month >= 6 && month <= 8) ? "Summer" : "Fall";
        const year = new Date().getFullYear();
        const variables = { search: { year, season, sortBy: "Latest_Update", allowAdult: false }, limit: 25, page: page, translationType: "sub", countryOrigin: "JP" };
        return this._fetchShows(variables);
    }
    async getLatestReleases() {
        const variables = { search: { sortBy: 'Latest_Update', allowAdult: false }, limit: 10, page: 1, translationType: 'sub', countryOrigin: 'JP' };
        return this._fetchShows(variables);
    }
    async getShowMeta(showId) {
        const response = await axios_1.default.get(API_ENDPOINT, {
            headers: { 'User-Agent': USER_AGENT, 'Referer': REFERER },
            params: { query: `query($showId: String!) { show(_id: $showId) { name, thumbnail, nativeName, englishName, availableEpisodesDetail } }`, variables: JSON.stringify({ showId }) },
            timeout: 15000
        });
        const show = response.data.data.show;
        if (show) {
            return {
                name: show.name,
                thumbnail: this.deobfuscateUrl(show.thumbnail),
                nativeName: show.nativeName,
                englishName: show.englishName,
                availableEpisodesDetail: show.availableEpisodesDetail
            };
        }
        return null;
    }
    async getEpisodes(showId, mode) {
        const cacheKey = `episodes-${showId}-${mode}`;
        const cachedData = this.cache.get(cacheKey);
        if (cachedData) {
            return cachedData;
        }
        const response = await axios_1.default.get(API_ENDPOINT, {
            headers: { 'User-Agent': USER_AGENT, 'Referer': REFERER },
            params: { query: `query($showId: String!) { show(_id: $showId) { availableEpisodesDetail, description } }`, variables: JSON.stringify({ showId }) },
            timeout: 15000
        });
        const showData = response.data.data.show;
        if (showData) {
            const episodeDetails = { episodes: showData.availableEpisodesDetail[mode] || [], description: showData.description };
            this.cache.set(cacheKey, episodeDetails);
            return episodeDetails;
        }
        return null;
    }
    async getSkipTimes(showId, episodeNumber) {
        try {
            const malIdResponse = await axios_1.default.get(API_ENDPOINT, {
                headers: { 'User-Agent': USER_AGENT, 'Referer': REFERER },
                params: { query: `query($showId: String!) { show(_id: $showId) { malId } }`, variables: JSON.stringify({ showId }) },
                timeout: 10000
            });
            const malId = malIdResponse.data?.data?.show?.malId;
            if (!malId)
                return { found: false, results: [] };
            const response = await axios_1.default.get(`https://api.aniskip.com/v1/skip-times/${malId}/${episodeNumber}?types=op&types=ed`, {
                headers: { 'User-Agent': USER_AGENT },
                timeout: 5000
            });
            return response.data;
        }
        catch {
            return { found: false, results: [] };
        }
    }
    async getStreamUrls(showId, episodeNumber, mode) {
        const { data } = await axios_1.default.get(API_ENDPOINT, {
            headers: { 'User-Agent': USER_AGENT, 'Referer': REFERER },
            params: {
                query: `query($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode(showId: $showId, translationType: $translationType, episodeString: $episodeString) { sourceUrls } }`,
                variables: JSON.stringify({ showId, translationType: mode, episodeString: episodeNumber })
            },
            timeout: 15000
        });
        const sourceUrls = data.data.episode.sourceUrls;
        if (!Array.isArray(sourceUrls))
            return null;
        const supportedSources = ['Yt-mp4', 'S-mp4', 'Luf-Mp4', 'wixmp', 'Default', 'Fm-Hls', 'Vg', 'Sw', 'Mp4', 'Ok'];
        const sources = sourceUrls
            .filter((s) => supportedSources.includes(s.sourceName))
            .sort((a, b) => b.priority - a.priority);
        const sourcePromises = sources.map(async (source) => {
            try {
                if (['Yt-mp4', 'S-mp4', 'Luf-Mp4', 'wixmp', 'Default'].includes(source.sourceName)) {
                    if (!source.sourceUrl.startsWith('--'))
                        return null;
                    let videoLinks = [];
                    let subtitles = [];
                    const decryptedUrl = ((s) => {
                        let d = '';
                        for (let i = 0; i < s.length; i += 2)
                            d += DEOBFUSCATION_MAP[s.substring(i, i + 2)] || s.substring(i, i + 2);
                        return d.includes('/clock') && !d.includes('.json') ? d.replace('/clock', '/clock.json') : d;
                    })(source.sourceUrl.substring(2)).replace(/([^:]\/)\/+/g, "$1");
                    if (decryptedUrl.includes('/clock.json')) {
                        const finalUrl = new URL(decryptedUrl, API_BASE_URL).href;
                        const { data: clockData } = await axios_1.default.get(finalUrl, { headers: { 'Referer': REFERER, 'User-Agent': USER_AGENT }, timeout: 10000 });
                        if (clockData.links && clockData.links.length > 0) {
                            videoLinks = clockData.links[0].hls ? await (async (u, h) => {
                                const { data: d } = await axios_1.default.get(u, { headers: h, timeout: 10000 });
                                const l = d.split('\n');
                                const q = [];
                                for (let i = 0; i < l.length; i++) {
                                    if (l[i].startsWith('#EXT-X-STREAM-INF')) {
                                        const rM = l[i].match(/RESOLUTION=\d+x(\d+)/);
                                        q.push({ resolutionStr: rM ? `${rM[1]}p` : 'Auto', link: new URL(l[i + 1], u).href, hls: true, headers: h });
                                    }
                                }
                                return q.length > 0 ? q : [{ resolutionStr: 'auto', link: u, hls: true, headers: h }];
                            })(clockData.links[0].link, clockData.links[0].headers) : clockData.links;
                            subtitles = clockData.links[0].subtitles || [];
                        }
                    }
                    else {
                        let finalLink = decryptedUrl;
                        if (finalLink.startsWith('/'))
                            finalLink = new URL(finalLink, API_BASE_URL).href;
                        videoLinks.push({ link: finalLink, resolutionStr: 'default', hls: finalLink.includes('.m3u8'), headers: { Referer: REFERER } });
                    }
                    if (videoLinks.length > 0)
                        return { sourceName: source.sourceName, links: videoLinks, subtitles, type: 'player' };
                }
                if (source.sourceName === 'Fm-Hls') {
                    if (source.type === 'iframe') {
                        return { sourceName: source.sourceName, links: [{ resolutionStr: 'iframe', link: source.sourceUrl, hls: false }], type: 'iframe' };
                    }
                }
                if (['Vg', 'Sw', 'Mp4', 'Ok'].includes(source.sourceName) && source.type === 'iframe') {
                    return { sourceName: source.sourceName, links: [{ resolutionStr: 'iframe', link: source.sourceUrl, hls: false }], type: 'iframe' };
                }
                return null;
            }
            catch (e) {
                logger_1.default.error({ err: e, sourceName: source.sourceName }, `Failed to process source`);
                return null;
            }
        });
        const results = await Promise.allSettled(sourcePromises);
        return results.map(result => result.status === 'fulfilled' ? result.value : null).filter(Boolean);
    }
    async getShowDetails(showId) {
        const metaQuery = `query($showId: String!) { show(_id: $showId) { name } }`;
        const metaResponse = await axios_1.default.get(API_ENDPOINT, {
            headers: { 'User-Agent': USER_AGENT, 'Referer': REFERER },
            params: { query: metaQuery, variables: JSON.stringify({ showId }) },
            timeout: 10000
        });
        const showName = metaResponse.data?.data?.show?.name;
        if (!showName) {
            throw new Error('Show not found');
        }
        const scheduleSearchUrl = `https://animeschedule.net/api/v3/anime?q=${encodeURIComponent(showName)}`;
        const scheduleResponse = await axios_1.default.get(scheduleSearchUrl, { timeout: 10000 });
        const firstResult = scheduleResponse.data?.anime?.[0];
        if (firstResult) {
            if (firstResult.status === 'Ongoing') {
                try {
                    const pageResponse = await axios_1.default.get(`https://animeschedule.net/anime/${firstResult.route}`, { timeout: 10000 });
                    const countdownMatch = pageResponse.data.match(/countdown-time" datetime="([^"]*)"/);
                    if (countdownMatch) {
                        firstResult.nextEpisodeAirDate = countdownMatch[1];
                    }
                }
                catch (_e) {
                    logger_1.default.warn({ err: _e }, 'Failed to scrape for nextEpisodeAirDate');
                }
            }
            return firstResult;
        }
        throw new Error('Not Found on Schedule');
    }
    async getAllmangaDetails(showId) {
        const url = `https://allmanga.to/bangumi/${showId}`;
        const headers = {
            "User-Agent": USER_AGENT,
            "Referer": REFERER
        };
        const response = await axios_1.default.get(url, { headers });
        const $ = cheerio.load(response.data);
        const details = {
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
        return details;
    }
}
exports.AllAnimeProvider = AllAnimeProvider;
