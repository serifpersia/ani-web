import axios, { type AxiosRequestConfig } from 'axios'
import logger from '../logger'
import * as crypto from 'node:crypto'
import {
  Provider,
  Show,
  VideoSource,
  EpisodeDetails,
  SkipIntervals,
  VideoLink,
  SubtitleTrack,
  SearchOptions,
} from './provider.interface'
import NodeCache from 'node-cache'

const API_BASE_URL = 'https://allanime.day'
const API_ENDPOINT = `https://api.mkissa.net/api`
const BOOTSTRAP_ENDPOINT = 'https://api.mkissa.net/client-crypto/v1/bootstrap?buildId=43'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
const REFERER = 'https://youtu-chan.com'

// AllAnime anti-bot crypto constants
const AA_BUILD_ID = '43'
const AA_MASK_HEX = '283330a221fe16145c0529bd318e419fccd3b837af213bf4f3138d510a2ad94b'
const AA_TS_WINDOW_MS = 300_000

interface BootstrapData {
  epoch: number
  partB: string
}

const DEOBFUSCATION_MAP: { [key: string]: string } = {
  '79': 'A',
  '7a': 'B',
  '7b': 'C',
  '7c': 'D',
  '7d': 'E',
  '7e': 'F',
  '7f': 'G',
  '70': 'H',
  '71': 'I',
  '72': 'J',
  '73': 'K',
  '74': 'L',
  '75': 'M',
  '76': 'N',
  '77': 'O',
  '68': 'P',
  '69': 'Q',
  '6a': 'R',
  '6b': 'S',
  '6c': 'T',
  '6d': 'U',
  '6e': 'V',
  '6f': 'W',
  '60': 'X',
  '61': 'Y',
  '62': 'Z',
  '59': 'a',
  '5a': 'b',
  '5b': 'c',
  '5c': 'd',
  '5d': 'e',
  '5e': 'f',
  '5f': 'g',
  '50': 'h',
  '51': 'i',
  '52': 'j',
  '53': 'k',
  '54': 'l',
  '55': 'm',
  '56': 'n',
  '57': 'o',
  '48': 'p',
  '49': 'q',
  '4a': 'r',
  '4b': 's',
  '4c': 't',
  '4d': 'u',
  '4e': 'v',
  '4f': 'w',
  '40': 'x',
  '41': 'y',
  '42': 'z',
  '08': '0',
  '09': '1',
  '0a': '2',
  '0b': '3',
  '0c': '4',
  '0d': '5',
  '0e': '6',
  '0f': '7',
  '00': '8',
  '01': '9',
  '15': '-',
  '16': '.',
  '67': '_',
  '46': '~',
  '02': ':',
  '17': '/',
  '07': '?',
  '1b': '#',
  '63': '[',
  '65': ']',
  '78': '@',
  '19': '!',
  '1c': '$',
  '1e': '&',
  '10': '(',
  '11': ')',
  '12': '*',
  '13': '+',
  '14': ',',
  '03': ';',
  '05': '=',
  '1d': '%',
}

interface RawClockLink {
  link: string
  hls?: boolean
  resolutionStr?: string
  headers?: Record<string, string>
  subtitles?: {
    lang?: string
    language?: string
    label?: string
    src?: string
    url?: string
  }[]
}

interface RawClockData {
  links: RawClockLink[]
}

export class AllAnimeProvider implements Provider {
  name = 'AllAnime'
  private cache: NodeCache
  private aaAesKey: Buffer
  private aaEpoch: number

  constructor(cache: NodeCache) {
    this.cache = cache
    this.aaEpoch = 0
    this.aaAesKey = Buffer.alloc(32)
  }

  private async fetchBootstrap(): Promise<BootstrapData> {
    const response = await axios.get(BOOTSTRAP_ENDPOINT, {
      headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
      timeout: 10000,
    })
    const data = response.data as BootstrapData
    if (!data?.partB || !data?.epoch) {
      throw new Error('Invalid bootstrap response')
    }
    return data
  }

  private deriveKey(partB: string): Buffer {
    const mask = Buffer.from(AA_MASK_HEX, 'hex')
    const partBBuf = Buffer.from(partB, 'base64')
    const key = Buffer.alloc(32)
    for (let i = 0; i < 32; i++) {
      key[i] = mask[i % mask.length] ^ partBBuf[i]
    }
    return key
  }

  private async ensureKey(): Promise<void> {
    if (this.aaAesKey.length === 32 && this.aaEpoch > 0) return
    const bootstrap = await this.fetchBootstrap()
    this.aaEpoch = bootstrap.epoch
    this.aaAesKey = this.deriveKey(bootstrap.partB)
  }

  private async refreshKey(): Promise<void> {
    const bootstrap = await this.fetchBootstrap()
    this.aaEpoch = bootstrap.epoch
    this.aaAesKey = this.deriveKey(bootstrap.partB)
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  private async _request(config: AxiosRequestConfig, retryCount = 0): Promise<any> {
    /* eslint-enable @typescript-eslint/no-explicit-any */
    await this.ensureKey()
    const response = await axios(config)
    const responseData = response.data

    if (responseData?.data?.tobeparsed) {
      responseData.data = this.decryptTobeparsed(responseData.data.tobeparsed)
    }

    if (responseData.errors && responseData.errors.length > 0) {
      const errorMsg: string = responseData.errors[0].message

      const rateLimitMatch = errorMsg.match(
        /^Too many requests, please try again in (\d+) seconds\.$/
      )
      if (rateLimitMatch) {
        if (retryCount >= 3) {
          throw new Error(`Rate limited after ${retryCount} retries: ${errorMsg}`)
        }
        const timeout = parseInt(rateLimitMatch[1], 10)
        await new Promise((resolve) => setTimeout(resolve, timeout * 1000))
        return this._request(config, retryCount + 1)
      }

      if (errorMsg === 'PersistedQueryNotFound') {
        throw new Error('PersistedQueryNotFound')
      }

      if (
        errorMsg === 'AA_CRYPTO_STALE' ||
        errorMsg === 'AA_CRYPTO_EXPIRED' ||
        errorMsg === 'AA_CRYPTO_BUILD_MISMATCH' ||
        errorMsg === 'AA_CRYPTO_QUERY_MISMATCH'
      ) {
        if (retryCount < 1) {
          await this.refreshKey()
          return this._request(config, retryCount + 1)
        }
      }

      throw new Error(`Server responded with unknown error: ${errorMsg}`)
    }

    return responseData
  }

  private decryptTobeparsed(encryptedBase64: string): unknown {
    try {
      const encryptedBuffer = Buffer.from(encryptedBase64, 'base64')

      if (encryptedBuffer.length < 30) {
        throw new Error('Encrypted data too short')
      }

      // Envelope: byte 0 = version (0x01), bytes 1..13 = IV, last 16 = auth tag, middle = ciphertext
      const iv = encryptedBuffer.subarray(1, 13)
      const tag = encryptedBuffer.subarray(encryptedBuffer.length - 16)
      const ciphertext = encryptedBuffer.subarray(13, encryptedBuffer.length - 16)

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.aaAesKey, iv)
      decipher.setAuthTag(tag)
      let decrypted = decipher.update(ciphertext)
      decrypted = Buffer.concat([decrypted, decipher.final()])

      const decryptedString = decrypted.toString('utf8')
      return JSON.parse(decryptedString)
    } catch (error: unknown) {
      const err = error as Error
      logger.error({ err: err.message, stack: err.stack }, 'Failed to decrypt tobeparsed field')
      const e = new Error(`Decryption failed: ${err.message}`)
      e.cause = error
      throw e
    }
  }

  private makeAaReq(queryHash: string): string {
    const ts = Math.floor(Date.now() / AA_TS_WINDOW_MS) * AA_TS_WINDOW_MS
    const epoch = this.aaEpoch
    const payload = JSON.stringify({
      v: 1,
      ts,
      epoch,
      buildId: AA_BUILD_ID,
      qh: queryHash,
    })
    const k = `${epoch}:${AA_BUILD_ID}:${queryHash}:${ts}`
    const iv = crypto.createHash('sha256').update(k).digest().subarray(0, 12)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.aaAesKey, iv)
    const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    const envelope = Buffer.concat([Buffer.from([0x01]), iv, encrypted, tag])
    return envelope.toString('base64')
  }

  private _hexDecode(obfuscatedBody: string): string {
    let result = ''
    for (let i = 0; i < obfuscatedBody.length; i += 2) {
      const chunk = obfuscatedBody.substring(i, i + 2)
      result += DEOBFUSCATION_MAP[chunk] || chunk
    }
    return result
  }

  private deobfuscateStreamUrl(obfuscatedUrl: string): string {
    if (!obfuscatedUrl) return ''
    if (!obfuscatedUrl.startsWith('--')) return obfuscatedUrl
    let deobfuscated = this._hexDecode(obfuscatedUrl.slice(2))
    deobfuscated = deobfuscated.replace(/([^:]\/)\/+/g, '$1')
    if (deobfuscated.startsWith('/')) {
      return `${API_BASE_URL}${deobfuscated}`
    }
    return deobfuscated
  }

  public deobfuscateUrl(obfuscatedUrl: string): string {
    if (!obfuscatedUrl) return ''
    let finalUrl = obfuscatedUrl
    if (
      !obfuscatedUrl.startsWith('--') &&
      (obfuscatedUrl.includes('s4.anilist.co') || obfuscatedUrl.startsWith('http'))
    ) {
      // Direct access works, proxy is blocked
      finalUrl = obfuscatedUrl
    } else if (obfuscatedUrl.startsWith('--')) {
      const deobfuscated = this._hexDecode(obfuscatedUrl.slice(2))
      if (deobfuscated.startsWith('/')) {
        if (deobfuscated.startsWith('/s4.anilist.co')) {
          finalUrl = `https:/${deobfuscated}`
        } else {
          // Use API_BASE_URL instead of the blocked proxy
          finalUrl = `${API_BASE_URL}${deobfuscated}`
        }
      } else {
        finalUrl = deobfuscated
      }
    }

    // Handle relative markers and paths
    if (!finalUrl.startsWith('http')) {
      if (finalUrl.startsWith('__Show__')) {
        finalUrl = `https://aln.youtube-anime.com/images/${finalUrl}`
      } else if (finalUrl.startsWith('mcovers') || finalUrl.startsWith('images2')) {
        finalUrl = `https://aln.youtube-anime.com/${finalUrl}`
      } else if (finalUrl.startsWith('/')) {
        finalUrl = `${API_BASE_URL}${finalUrl}`
      }
    }

    if (finalUrl.includes('wp.youtube-anime.com') || finalUrl.includes('allanime.day')) {
      // refererValue would be set here in the full context
    }

    // Final robust cleanup for aln host and path structure
    if (finalUrl.includes('aln.youtube-anime.com')) {
      // Ensure we use the correct host (remove allanime.day prefix if present)
      finalUrl = finalUrl.replace(
        /https?:\/\/allanime\.day\/aln\.youtube-anime\.com/,
        'https://aln.youtube-anime.com'
      )

      // Remove incorrect /images/ prefix for mcovers/images2
      if (finalUrl.includes('/images/mcovers')) {
        finalUrl = finalUrl.replace('/images/mcovers', '/mcovers')
      }
      if (finalUrl.includes('/images/images2')) {
        finalUrl = finalUrl.replace('/images/images2', '/images2')
      }
    }

    // Don't use the allanime.day proxy for s4.anilist.co URLs
    if (finalUrl.includes('allanime.day/s4.anilist.co')) {
      finalUrl = finalUrl.replace('https://allanime.day/s4.anilist.co', 'https://s4.anilist.co')
      finalUrl = finalUrl.replace('http://allanime.day/s4.anilist.co', 'https://s4.anilist.co')
    }

    // Strip any existing local proxy prefixes that might have been saved
    if (finalUrl.includes('/api/image-proxy?url=')) {
      const match = finalUrl.match(/url=([^&]+)/)
      if (match) {
        const unwrapped = decodeURIComponent(match[1])
        finalUrl = unwrapped
        // Recurse once to catch the anilist fix for the unwrapped URL
        return this.deobfuscateUrl(finalUrl)
      }
    }

    return finalUrl
  }

  private async _fetchShows(
    variables: Record<string, unknown>,
    extensions?: Record<string, unknown>
  ): Promise<Show[]> {
    const body: Record<string, unknown> = { variables }
    const fullQuery = `
      query ($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) {
        shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) {
          edges { _id name nativeName englishName thumbnail description type availableEpisodesDetail isAdult rating }
        }
      }`
    if (extensions) {
      body.extensions = extensions
    } else {
      body.query = fullQuery
    }
    try {
      const responseData = await this._request({
        method: 'POST',
        url: API_ENDPOINT,
        data: body,
        headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
        timeout: 15000,
      })
      const shows = responseData?.data?.shows?.edges || []
      return shows.map((show: Show) => ({
        ...show,
        thumbnail: this.deobfuscateUrl(show.thumbnail || ''),
      }))
    } catch (error: unknown) {
      const err = error as { message?: string }
      if (err.message === 'PersistedQueryNotFound' && extensions) {
        logger.info('Search hash expired, falling back to full query')
        const responseData = await this._request({
          method: 'POST',
          url: API_ENDPOINT,
          data: { variables, query: fullQuery },
          headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
          timeout: 15000,
        })
        const shows = responseData?.data?.shows?.edges || []
        return shows.map((show: Show) => ({
          ...show,
          thumbnail: this.deobfuscateUrl(show.thumbnail || ''),
        }))
      }
      throw error
    }
  }

  async search(options: SearchOptions): Promise<Show[]> {
    const {
      query,
      season,
      year,
      sortBy,
      page,
      limit,
      type,
      country,
      translation,
      genres,
      excludeGenres,
      tags,
      excludeTags,
      studios,
    } = options
    const searchObj: Record<string, unknown> = { allowAdult: false }
    if (query) searchObj.query = query
    if (season && season !== 'ALL') searchObj.season = season
    if (year && year !== 'ALL') searchObj.year = parseInt(year as string)
    if (sortBy) searchObj.sortBy = sortBy
    if (type && type !== 'ALL') searchObj.types = [type]
    if (genres) searchObj.genres = (genres as string).split(',')
    if (excludeGenres) searchObj.excludeGenres = (excludeGenres as string).split(',')
    if (tags) searchObj.tags = (tags as string).split(',')
    if (studios) searchObj.studios = (studios as string).split(',')
    if (excludeTags) searchObj.excludeTags = (excludeTags as string).split(',')
    const variables = {
      search: searchObj,
      limit: parseInt(limit as string) || 14,
      page: parseInt(page as string) || 1,
      translationType: translation && translation !== 'ALL' ? translation : 'sub',
      countryOrigin: country && country !== 'ALL' ? country : 'ALL',
    }
    return this._fetchShows(variables)
  }

  async getPopular(
    timeframe: 'daily' | 'weekly' | 'monthly' | 'all',
    page: number = 1,
    size: number = 10
  ): Promise<Show[]> {
    let dateRange = 0
    switch (timeframe) {
      case 'daily':
        dateRange = 1
        break
      case 'weekly':
        dateRange = 7
        break
      case 'monthly':
        dateRange = 30
        break
    }
    const variables = {
      type: 'anime',
      size,
      page,
      allowAdult: false,
      allowUnknown: false,
      dateRange,
    }
    const extensions = {
      persistedQuery: {
        version: 1,
        sha256Hash: '60f50b84bb545fa25ee7f7c8c0adbf8f5cea40f7b1ef8501cbbff70e38589489',
      },
    }
    try {
      const responseData = await this._request({
        method: 'POST',
        url: API_ENDPOINT,
        data: { variables, extensions },
        headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
        timeout: 15000,
      })
      const recommendations = responseData?.data?.queryPopular?.recommendations || []
      return recommendations.map((rec: { anyCard: Show }) => {
        const card = rec.anyCard
        return { ...card, thumbnail: this.deobfuscateUrl(card.thumbnail || '') }
      })
    } catch (error: unknown) {
      const err = error as { message?: string }
      if (err.message === 'PersistedQueryNotFound') {
        logger.info('Popular hash expired, falling back to full query')
        const fullQuery = `
          query ($type: VaildPopularTypeEnumType!, $size: Int!, $dateRange: Int, $page: Int, $allowAdult: Boolean, $allowUnknown: Boolean) {
            queryPopular(type: $type, size: $size, dateRange: $dateRange, page: $page, allowAdult: $allowAdult, allowUnknown: $allowUnknown) {
              recommendations {
                anyCard { _id name nativeName englishName thumbnail type availableEpisodesDetail isAdult rating }
              }
            }
          }`
        const responseData = await this._request({
          method: 'POST',
          url: API_ENDPOINT,
          data: { query: fullQuery, variables },
          headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
          timeout: 15000,
        })
        const recommendations = responseData?.data?.queryPopular?.recommendations || []
        return recommendations.map((rec: { anyCard: Show }) => {
          const card = rec.anyCard
          return { ...card, thumbnail: this.deobfuscateUrl(card.thumbnail || '') }
        })
      }
      throw error
    }
  }

  async getSchedule(date: Date): Promise<Show[]> {
    const startOfDay = new Date(date)
    startOfDay.setUTCHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setUTCHours(23, 59, 59, 999)
    const variables = {
      search: {
        dateRangeStart: Math.floor(startOfDay.getTime() / 1000),
        dateRangeEnd: Math.floor(endOfDay.getTime() / 1000),
        sortBy: 'Latest_Update',
      },
      limit: 50,
      page: 1,
      translationType: 'sub',
      countryOrigin: 'ALL',
    }
    return this._fetchShows(variables)
  }

  async getSeasonal(page: number): Promise<Show[]> {
    const month = new Date().getMonth()
    const season =
      month >= 0 && month <= 2
        ? 'Winter'
        : month >= 3 && month <= 5
          ? 'Spring'
          : month >= 6 && month <= 8
            ? 'Summer'
            : 'Fall'
    const year = new Date().getFullYear()
    const variables = {
      search: { year, season, sortBy: 'Latest_Update', allowAdult: false },
      limit: 14,
      page,
      translationType: 'sub',
      countryOrigin: 'JP',
    }
    return this._fetchShows(variables)
  }

  async getLatestReleases(page: number = 1, size: number = 14): Promise<Show[]> {
    const variables = {
      search: { sortBy: 'Latest_Update', allowAdult: false },
      limit: size,
      page,
      translationType: 'sub',
      countryOrigin: 'JP',
    }
    return this._fetchShows(variables)
  }

  async getShowMeta(showId: string, _ua?: string, _cookie?: string): Promise<Partial<Show> | null> {
    let responseData: any
    try {
      responseData = await this._request({
        method: 'POST',
        url: API_ENDPOINT,
        data: {
          variables: { _id: showId },
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash: '043448386c7a686bc2aabfbb6b80f6074e795d350df48015023b079527b0848a',
            },
          },
        },
        headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
        timeout: 15000,
      })
    } catch (error: unknown) {
      const err = error as { message?: string }
      if (err.message === 'PersistedQueryNotFound') {
        logger.info('Show meta hash expired, falling back to full query')
        responseData = await this._request({
          method: 'POST',
          url: API_ENDPOINT,
          data: {
            query: `query($showId: String!) { show(_id: $showId) { _id name nativeName englishName altNames thumbnail thumbnails banner description genres tags type availableEpisodes availableEpisodesDetail episodeCount episodeDuration score averageScore isAdult status studios airedStart airedEnd rating countryOfOrigin season } }`,
            variables: { showId },
          },
          headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
          timeout: 15000,
        })
      } else {
        throw error
      }
    }
    const show = responseData.data?.show
    if (show) {
      return {
        _id: show._id,
        name: show.name,
        thumbnail: this.deobfuscateUrl(show.thumbnail || ''),
        thumbnails: Array.isArray(show.thumbnails) ? show.thumbnails : undefined,
        bannerImage: show.banner,
        description: show.description,
        genres: show.genres ? show.genres.map((g: string) => ({ name: g })) : [],
        tags: show.tags ? show.tags.map((t: string) => ({ name: t })) : [],
        nativeName: show.nativeName,
        englishName: show.englishName,
        type: show.type,
        availableEpisodes: show.availableEpisodes,
        availableEpisodesDetail: show.availableEpisodesDetail,
        episodeCount: show.episodeCount,
        episodeDuration: show.episodeDuration,
        score: show.score,
        averageScore: show.averageScore,
        isAdult: show.isAdult,
        status: show.status,
        studios: show.studios ? show.studios.map((s: string) => ({ name: s })) : [],
        airedStart: show.airedStart,
        airedEnd: show.airedEnd,
        rating: show.rating,
        country: show.countryOfOrigin,
        season: show.season,
        names: {
          romaji: show.name,
          english: show.englishName,
          native: show.nativeName,
          synonyms: show.altNames,
        },
      }
    }
    return null
  }

  async getEpisodes(
    showId: string,
    mode: 'sub' | 'dub',
    _ua?: string,
    _cookie?: string
  ): Promise<EpisodeDetails | null> {
    const cacheKey = `episodes-${showId}-${mode}`
    const cachedData = this.cache.get<EpisodeDetails>(cacheKey)
    if (cachedData) return cachedData
    const responseData = await this._request({
      method: 'POST',
      url: API_ENDPOINT,
      data: {
        query: `query($showId: String!) { show(_id: $showId) { availableEpisodesDetail, description } }`,
        variables: { showId },
      },
      headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
      timeout: 15000,
    })
    const showData = responseData.data.show
    if (showData) {
      const episodeDetails = {
        episodes: (showData.availableEpisodesDetail[mode] as string[]) || [],
        description: showData.description,
      }
      this.cache.set(cacheKey, episodeDetails)
      return episodeDetails
    }
    return null
  }

  async getSkipTimes(showId: string, episodeNumber: string): Promise<SkipIntervals> {
    try {
      const responseData = await this._request({
        method: 'POST',
        url: API_ENDPOINT,
        data: {
          query: `query($showId: String!) { show(_id: $showId) { malId } }`,
          variables: { showId },
        },
        headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
        timeout: 10000,
      })
      const malId = responseData?.data?.show?.malId
      if (!malId) return { found: false, results: [] }
      const response = await axios.get(
        `https://api.aniskip.com/v1/skip-times/${malId}/${episodeNumber}?types=op&types=ed`,
        {
          headers: { 'User-Agent': USER_AGENT },
          timeout: 5000,
        }
      )
      return response.data as SkipIntervals
    } catch {
      return { found: false, results: [] }
    }
  }

  async getStreamUrls(
    showId: string,
    episodeNumber: string,
    mode: 'sub' | 'dub'
  ): Promise<VideoSource[] | null> {
    const episodeQueryHash = '09caca435564416f37d5c78256c8e6e517007c3006529857e84ba2466bfcbea6'

    const makeRequest = async () => {
      const aaReqToken = this.makeAaReq(episodeQueryHash)
      const variablesParam = encodeURIComponent(
        JSON.stringify({ showId, translationType: mode, episodeString: episodeNumber })
      )
      const extensionsParam = encodeURIComponent(
        JSON.stringify({
          persistedQuery: {
            version: 1,
            sha256Hash: episodeQueryHash,
          },
          aaReq: aaReqToken,
        })
      )
      const requestUrl = `${API_ENDPOINT}?variables=${variablesParam}&extensions=${extensionsParam}`
      return this._request({
        method: 'GET',
        url: requestUrl,
        headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
        timeout: 15000,
      })
    }

    let responseData: any
    try {
      responseData = await makeRequest()
    } catch (error: unknown) {
      const err = error as { message?: string }
      if (
        err.message?.includes('AA_CRYPTO_STALE') ||
        err.message?.includes('AA_CRYPTO_EXPIRED') ||
        err.message?.includes('AA_CRYPTO_BUILD_MISMATCH') ||
        err.message?.includes('AA_CRYPTO_QUERY_MISMATCH')
      ) {
        await this.refreshKey()
        responseData = await makeRequest()
      } else {
        throw error
      }
    }
    const sourceUrls = responseData.data?.episode?.sourceUrls as {
      sourceName: string
      sourceUrl: string
      priority?: number
      type?: string
    }[]

    if (!Array.isArray(sourceUrls)) return null
    const filteredSources = sourceUrls.sort((a, b) => (b.priority || 0) - (a.priority || 0))
    const processedSources: (VideoSource | null)[] = await Promise.all(
      filteredSources.map(async (source) => {
        try {
          let videoLinks: VideoLink[] = []
          let subtitles: SubtitleTrack[] = []

          if (['wixmp', 'Default'].includes(source.sourceName)) {
            let decryptedUrl = this.deobfuscateStreamUrl(source.sourceUrl)
            if (decryptedUrl.includes('/clock') && !decryptedUrl.includes('.json')) {
              decryptedUrl = decryptedUrl.replace('/clock', '/clock.json')
            }

            if (decryptedUrl.includes('/clock.json')) {
              const finalUrl = decryptedUrl.startsWith('http')
                ? decryptedUrl
                : new URL(decryptedUrl, API_BASE_URL).href
              const resp = await axios.get(finalUrl, {
                headers: { Referer: REFERER, 'User-Agent': USER_AGENT },
                timeout: 10000,
              })
              const clockData = resp.data as RawClockData
              if (clockData && Array.isArray(clockData.links) && clockData.links.length > 0) {
                const linkData = clockData.links[0]
                if (linkData.hls) {
                  const hlsResp = await axios.get(linkData.link, {
                    headers: linkData.headers || { Referer: REFERER },
                    responseType: 'text',
                    timeout: 10000,
                  })
                  const lines = (hlsResp.data as string).split('\n')
                  for (let i = 0; i < lines.length; i++) {
                    if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                      const resMatch = lines[i].match(/RESOLUTION=\d+x(\d+)/)
                      videoLinks.push({
                        resolutionStr: resMatch ? `${resMatch[1]}p` : 'Auto',
                        link: new URL(lines[i + 1], linkData.link).href,
                        hls: true,
                        headers: linkData.headers || { Referer: REFERER },
                      })
                    }
                  }
                } else {
                  videoLinks = clockData.links
                    .map((l) => ({
                      resolutionStr: l.resolutionStr || 'Default',
                      link:
                        l.link && l.link.startsWith('/')
                          ? `${API_BASE_URL}${l.link}`
                          : l.link || '',
                      hls: !!l.hls,
                      headers: l.headers || { Referer: REFERER },
                    }))
                    .filter((l) => l.link !== '')
                }
                if (Array.isArray(linkData.subtitles)) {
                  subtitles = linkData.subtitles.map((s) => ({
                    language: s.lang || s.language || 'en',
                    label: s.label || 'Subtitle',
                    url:
                      s.src && s.src.startsWith('/')
                        ? `${API_BASE_URL}${s.src}`
                        : s.src || s.url || '',
                  }))
                }
              }
            }
            if (videoLinks.length === 0 && decryptedUrl && !decryptedUrl.includes('/clock')) {
              videoLinks.push({
                resolutionStr: 'Default',
                link: decryptedUrl,
                hls: decryptedUrl.includes('.m3u8'),
                headers: { Referer: REFERER },
              })
            }
            if (videoLinks.length > 0) {
              return {
                sourceName: source.sourceName,
                links: videoLinks,
                subtitles,
                type: 'player',
              }
            }
          } else if (source.sourceName === 'Mp4') {
            const decryptedUrl = this.deobfuscateStreamUrl(source.sourceUrl)
            try {
              const { data: embedHtml } = await axios.get(decryptedUrl, {
                headers: {
                  'User-Agent': USER_AGENT,
                  Referer: 'https://allanime.day/',
                },
                timeout: 10000,
              })
              const match =
                typeof embedHtml === 'string'
                  ? embedHtml.match(/src:\s*"(https:\/\/[^"]+\.mp4)"/)
                  : null
              if (match) {
                return {
                  sourceName: source.sourceName,
                  links: [
                    {
                      resolutionStr: 'Default',
                      link: match[1],
                      hls: false,
                      headers: { Referer: 'https://www.mp4upload.com/' },
                    },
                  ],
                  type: 'player',
                }
              }
            } catch (e) {
              // Ignore scrape errors
            }
            return {
              sourceName: source.sourceName,
              links: [{ resolutionStr: 'iframe', link: decryptedUrl, hls: false }],
              type: 'iframe',
            }
          } else {
            const skipSources = ['Luf-Mp4', 'S-mp4', 'Vn-Hls', 'Ak', 'Ss-Hls', 'Sl-mp4']
            if (skipSources.includes(source.sourceName)) return null
            const directSources = ['Yt-mp4', 'Default', 'wixmp']
            if (directSources.includes(source.sourceName)) {
              const decryptedUrl = this.deobfuscateStreamUrl(source.sourceUrl)
              return {
                sourceName: source.sourceName,
                links: [
                  {
                    resolutionStr: 'Default',
                    link: decryptedUrl,
                    hls: decryptedUrl.includes('.m3u8'),
                    headers: { Referer: REFERER },
                  },
                ],
                type: 'player',
              }
            }
            return {
              sourceName: source.sourceName,
              links: [{ resolutionStr: 'iframe', link: source.sourceUrl, hls: false }],
              type:
                source.type === 'iframe' ||
                source.sourceName === 'Fm-Hls' ||
                ['Vg', 'Sw', 'Ok', 'Uni'].includes(source.sourceName)
                  ? 'iframe'
                  : 'player',
            }
          }
        } catch (e) {
          return null
        }
        return null
      })
    )
    const result = processedSources.filter((s): s is VideoSource => s !== null)
    return result.length > 0 ? result : null
  }
}
