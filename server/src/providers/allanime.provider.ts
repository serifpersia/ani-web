import { gotScraping } from 'got-scraping'
import logger from '../logger'
import * as crypto from 'node:crypto'
import { requestContext } from '../utils/request-context'
import { sanitizeCfClearance } from '../utils/cookie.utils'
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
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
const REFERER = 'https://youtu-chan.com'

const AA_BUILD_ID = () => process.env.AA_BUILD_ID || '72'
const AA_MASK_HEX = () =>
  process.env.AA_MASK_HEX || 'ff420daab5d04687e46e093ecf02285c633b9278f39a594df945a70079a3bdcc'
const AA_BOOTSTRAP_HOST = 'api.mkissa.net'
const AA_BOOTSTRAP_BASE = '/client-crypto/v1/bootstrap'
const AA_EPOCH_MS = 259_200_000
const AA_GRACE_MS = 86_400_000
const AA_TS_BUCKET_MS = 300_000

function getAaHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const store = requestContext.getStore()
  const rawCookie = store?.get('cookie') || ''
  const cookieValue = sanitizeCfClearance(rawCookie)
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Referer: REFERER,
    Origin: 'https://mkissa.to',
    ...extra,
  }
  if (cookieValue) {
    headers['Cookie'] = `cf_clearance=${cookieValue}`
  }
  return headers
}

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

  private makeBootToken(buildId: string, mask: Buffer, epoch: number, lane: string): string {
    const host = 'mkissa.to'
    const keyGroup = 'mkissa'
    const inner = crypto.createHmac('sha256', mask).update(`aa-boot:${buildId}`).digest()
    const payload = `${buildId}:${keyGroup}:${host}:${epoch}:${lane}`
    return crypto.createHmac('sha256', inner).update(payload).digest('hex')
  }

  private getFsEpoch(): number {
    const now = Date.now()
    const t = Math.floor(now / AA_EPOCH_MS)
    return now - t * AA_EPOCH_MS < AA_GRACE_MS && t > 0 ? t - 1 : t
  }

  private getBhEpoch(): number {
    return Math.floor(Date.now() / AA_EPOCH_MS)
  }

  private async fetchBootstrap(): Promise<BootstrapData> {
    const buildId = AA_BUILD_ID()
    const mask = Buffer.from(AA_MASK_HEX(), 'hex')
    const lane = 'k7'
    const epochs = [...new Set([this.getFsEpoch(), this.getBhEpoch()])]
    let lastErr: unknown

    for (const epoch of epochs) {
      const token = this.makeBootToken(buildId, mask, epoch, lane)
      try {
        const resp = await gotScraping({
          url: `https://${AA_BOOTSTRAP_HOST}${AA_BOOTSTRAP_BASE}?buildId=${buildId}&k=${lane}`,
          method: 'GET',
          headers: getAaHeaders({
            'x-build-id': buildId,
            'x-aa-boot': token,
          }),
          responseType: 'text',
          timeout: { request: 10000 },
          followRedirect: true,
          throwHttpErrors: false,
        })
        const data = JSON.parse(resp.body) as BootstrapData
        if (!data?.partB || !data?.epoch) {
          throw new Error('Invalid bootstrap response')
        }
        return data
      } catch (err: unknown) {
        if (
          typeof err === 'object' &&
          err !== null &&
          (err as { response?: { data?: unknown } }).response
        ) {
          const respData = (err as { response: { data?: { error?: string } } }).response.data
          if (respData?.error === 'unknown_build_id') {
            throw new Error('AA_CRYPTO_STALE: unknown build ID', { cause: err })
          }
        }
        lastErr = err
      }
    }
    throw lastErr || new Error('Bootstrap failed for all epochs')
  }

  private deriveKey(partB: string): Buffer {
    const mask = Buffer.from(AA_MASK_HEX(), 'hex')
    const partBBuf = Buffer.from(partB, 'base64')
    const key = Buffer.alloc(partBBuf.length)
    for (let i = 0; i < partBBuf.length; i++) {
      key[i] = mask[i % mask.length] ^ partBBuf[i]
    }
    return key
  }

  private async ensureKey(): Promise<void> {
    if (this.aaAesKey.length > 0 && this.aaEpoch > 0) return
    try {
      const bootstrap = await this.fetchBootstrap()
      this.aaEpoch = bootstrap.epoch
      this.aaAesKey = this.deriveKey(bootstrap.partB)
    } catch (err) {
      logger.warn({ err }, 'Bootstrap failed — crypto operations (streaming) unavailable')
    }
  }

  async refreshKey(): Promise<void> {
    const bootstrap = await this.fetchBootstrap()
    this.aaEpoch = bootstrap.epoch
    this.aaAesKey = this.deriveKey(bootstrap.partB)
  }

  async recoverFromStale(buildId: string, maskHex: string): Promise<void> {
    process.env.AA_BUILD_ID = buildId
    process.env.AA_MASK_HEX = maskHex
    await this.refreshKey()
  }

  getCurrentBuildId(): string {
    return AA_BUILD_ID()
  }

  getCurrentMaskHex(): string {
    return AA_MASK_HEX()
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  private async _request(config: Record<string, unknown>, retryCount = 0): Promise<any> {
    /* eslint-enable @typescript-eslint/no-explicit-any */
    await this.ensureKey()
    const url = typeof config.url === 'string' ? config.url : String(config.url)
    const method = ((config.method as string) || 'GET').toUpperCase() as 'GET' | 'POST'
    const headers = { ...(config.headers || {}) } as Record<string, string>
    const body = config.data ? JSON.stringify(config.data) : undefined
    const timeoutMs = (config.timeout as number) || 15000

    const resp = await gotScraping({
      url,
      method,
      headers,
      body,
      responseType: 'text',
      timeout: { request: timeoutMs },
      followRedirect: true,
      throwHttpErrors: false,
    })

    let responseData
    try {
      responseData = resp.body ? JSON.parse(resp.body) : null
    } catch {
      throw new Error('Invalid JSON response')
    }

    if (responseData?.data?.tobeparsed) {
      responseData.data = this.decryptTobeparsed(responseData.data.tobeparsed)
    }

    if (responseData?.errors && responseData.errors.length > 0) {
      const errorMsg: string = responseData.errors[0].message

      const rateLimitMatch = errorMsg.match(
        /^Too many requests, please try again in (\d+) seconds\.$/
      )
      if (rateLimitMatch) {
        if (retryCount >= 3) {
          throw new Error(`Rate limited after ${retryCount} retries: ${errorMsg}`)
        }
        const waitMs = parseInt(rateLimitMatch[1], 10) * 1000
        await new Promise((resolve) => setTimeout(resolve, waitMs))
        return this._request(config, retryCount + 1)
      }

      if (errorMsg === 'PersistedQueryNotFound') {
        throw new Error('PersistedQueryNotFound')
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

  private makeAaReq(queryHash: string, lane = 'k7'): string {
    const epoch = this.aaEpoch
    const ts = Math.floor(Date.now() / AA_TS_BUCKET_MS) * AA_TS_BUCKET_MS
    const payload = JSON.stringify({
      v: 1,
      ts,
      epoch,
      buildId: AA_BUILD_ID(),
      qh: queryHash,
      k: lane,
    })
    const iv = crypto.randomBytes(12)
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
    const fullQuery = `
      query ($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) {
        shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) {
          edges { _id name nativeName englishName thumbnail description type availableEpisodesDetail isAdult rating }
        }
      }`
    const variablesParam = encodeURIComponent(JSON.stringify(variables))

    async function tryFetch(
      provider: AllAnimeProvider,
      extensionsParam?: string,
      queryParam?: string
    ) {
      let requestUrl = `${API_ENDPOINT}?variables=${variablesParam}`
      if (extensionsParam) {
        requestUrl += `&extensions=${extensionsParam}`
      } else if (queryParam) {
        requestUrl += `&query=${queryParam}`
      }
      return provider._request({
        method: 'GET',
        url: requestUrl,
        headers: getAaHeaders(),
        timeout: 15000,
      })
    }

    try {
      let extensionsParam: string | undefined
      if (extensions) {
        extensionsParam = encodeURIComponent(JSON.stringify(extensions))
      }
      const responseData = await tryFetch(this, extensionsParam)
      const rawShows = responseData?.data?.shows
      const showsArray = Array.isArray(rawShows)
        ? rawShows
        : Array.isArray(rawShows?.edges)
          ? rawShows.edges
          : []
      return showsArray.map((show: Show) => ({
        ...show,
        thumbnail: this.deobfuscateUrl(
          ((show as unknown as Record<string, unknown>).thumbnail as string) || ''
        ),
      }))
    } catch (error: unknown) {
      const err = error as { message?: string }
      if (err.message === 'PersistedQueryNotFound') {
        logger.info('AllAnime search hash expired, falling back to full query GET')
        const queryParam = encodeURIComponent(fullQuery)
        const responseData = await tryFetch(this, undefined, queryParam)
        const rawShows = responseData?.data?.shows
        const showsArray = Array.isArray(rawShows)
          ? rawShows
          : Array.isArray(rawShows?.edges)
            ? rawShows.edges
            : []
        return showsArray.map((show: Show) => ({
          ...show,
          thumbnail: this.deobfuscateUrl(
            ((show as unknown as Record<string, unknown>).thumbnail as string) || ''
          ),
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
    const extensions = {
      persistedQuery: {
        version: 1,
        sha256Hash: '4717b9be6c8e5858850c4b5458c9b53076ebf27c0520279be29d5aed9f3679c7',
      },
    }
    return this._fetchShows(variables, extensions)
  }

  async resolveShowId(title: string, _romaji?: string): Promise<string | null> {
    const variables = { search: { query: title, allowAdult: true } }
    const variablesParam = encodeURIComponent(JSON.stringify(variables))
    const extensions = {
      persistedQuery: {
        version: 1,
        sha256Hash: '4717b9be6c8e5858850c4b5458c9b53076ebf27c0520279be29d5aed9f3679c7',
      },
    }
    const extensionsParam = encodeURIComponent(JSON.stringify(extensions))
    const requestUrl = `${API_ENDPOINT}?variables=${variablesParam}&extensions=${extensionsParam}`
    try {
      const result = await this._request({
        method: 'GET',
        url: requestUrl,
        headers: getAaHeaders(),
        timeout: 10000,
      })
      const edge = result?.data?.shows?.edges?.[0]
      if (edge?._id) {
        return edge._id as string
      }
      return null
    } catch (err: unknown) {
      const errMsg = (err as Error)?.message || ''
      logger.warn({ err: errMsg, title }, 'AllAnime resolveShowId failed')
      return null
    }
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
        sha256Hash: 'a0aca6827cc9a3ad7bc711da4d200a04adea8f1a7545dc418d5e92e74c3aad15',
      },
    }
    const variablesParam = encodeURIComponent(JSON.stringify(variables))
    const extensionsParam = encodeURIComponent(JSON.stringify(extensions))
    const requestUrl = `${API_ENDPOINT}?variables=${variablesParam}&extensions=${extensionsParam}`
    try {
      const responseData = await this._request({
        method: 'GET',
        url: requestUrl,
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
        logger.info('AllAnime popular hash expired, falling back to full query GET')
        const fullQuery = `
          query ($type: VaildPopularTypeEnumType!, $size: Int!, $dateRange: Int, $page: Int, $allowAdult: Boolean, $allowUnknown: Boolean) {
            queryPopular(type: $type, size: $size, dateRange: $dateRange, page: $page, allowAdult: $allowAdult, allowUnknown: $allowUnknown) {
              recommendations {
                anyCard { _id name nativeName englishName thumbnail type availableEpisodesDetail isAdult rating }
              }
            }
          }`
        const queryParam = encodeURIComponent(fullQuery)
        const fallbackUrl = `${API_ENDPOINT}?variables=${variablesParam}&query=${queryParam}`
        const responseData = await this._request({
          method: 'GET',
          url: fallbackUrl,
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
    const extensions = {
      persistedQuery: {
        version: 1,
        sha256Hash: 'bc896210babaf9967479eb204c27b9cd8312f9d6b84cb7a8a8defe47bdd6da16',
      },
    }
    const variablesParam = encodeURIComponent(JSON.stringify({ _id: showId }))
    const extensionsParam = encodeURIComponent(JSON.stringify(extensions))
    const requestUrl = `${API_ENDPOINT}?variables=${variablesParam}&extensions=${extensionsParam}`
    let responseData: { data?: { show?: Record<string, unknown> } }
    try {
      responseData = await this._request({
        method: 'GET',
        url: requestUrl,
        headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
        timeout: 15000,
      })
    } catch (error: unknown) {
      const err = error as { message?: string }
      if (err.message === 'PersistedQueryNotFound') {
        logger.info('AllAnime show meta hash expired, falling back to full query GET')
        const fullQuery = `query($showId: String!) { show(_id: $showId) { _id name nativeName englishName altNames thumbnail thumbnails banner description genres tags type availableEpisodes availableEpisodesDetail episodeCount episodeDuration score averageScore isAdult status studios airedStart airedEnd rating countryOfOrigin season } }`
        const queryParam = encodeURIComponent(fullQuery)
        const fallbackUrl = `${API_ENDPOINT}?variables=${variablesParam}&query=${queryParam}`
        responseData = await this._request({
          method: 'GET',
          url: fallbackUrl,
          headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
          timeout: 15000,
        })
      } else {
        throw error
      }
    }
    const show = responseData.data?.show as Record<string, unknown> | undefined
    if (show) {
      return {
        _id: show._id as string | undefined,
        name: show.name as string | undefined,
        thumbnail: this.deobfuscateUrl((show.thumbnail as string) || ''),
        thumbnails: Array.isArray(show.thumbnails) ? (show.thumbnails as string[]) : undefined,
        bannerImage: show.banner as string | undefined,
        description: show.description as string | undefined,
        genres: Array.isArray(show.genres)
          ? (show.genres as string[]).map((g: string) => ({ name: g }))
          : [],
        tags: Array.isArray(show.tags)
          ? (show.tags as string[]).map((t: string) => ({ name: t }))
          : [],
        nativeName: show.nativeName as string | undefined,
        englishName: show.englishName as string | undefined,
        type: show.type as string | undefined,
        availableEpisodes: show.availableEpisodes as
          | { sub?: number; dub?: number; raw?: number }
          | undefined,
        availableEpisodesDetail: show.availableEpisodesDetail as
          | { sub?: string[]; dub?: string[]; raw?: string[] }
          | undefined,
        episodeCount: show.episodeCount as string | number | null | undefined,
        episodeDuration: show.episodeDuration as string | number | null | undefined,
        score: show.score as number | null | undefined,
        averageScore: show.averageScore as number | null | undefined,
        isAdult: show.isAdult as boolean | undefined,
        status: show.status as string | undefined,
        studios: Array.isArray(show.studios)
          ? (show.studios as string[]).map((s: string) => ({ name: s }))
          : [],
        airedStart: show.airedStart as Record<string, unknown> | null | undefined,
        airedEnd: show.airedEnd as Record<string, unknown> | null | undefined,
        rating: show.rating as string | undefined,
        country: show.countryOfOrigin as string | null | undefined,
        season: show.season as Record<string, unknown> | null | undefined,
        names: {
          romaji: show.name as string | undefined,
          english: show.englishName as string | undefined,
          native: show.nativeName as string | undefined,
          synonyms: show.altNames as string[] | undefined,
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

    const extensions = {
      persistedQuery: {
        version: 1,
        sha256Hash: 'bc896210babaf9967479eb204c27b9cd8312f9d6b84cb7a8a8defe47bdd6da16',
      },
    }
    const variablesParam = encodeURIComponent(JSON.stringify({ _id: showId }))
    const extensionsParam = encodeURIComponent(JSON.stringify(extensions))
    const requestUrl = `${API_ENDPOINT}?variables=${variablesParam}&extensions=${extensionsParam}`

    let responseData: { data?: { show?: Record<string, unknown> } }
    try {
      responseData = await this._request({
        method: 'GET',
        url: requestUrl,
        headers: getAaHeaders(),
        timeout: 15000,
      })
    } catch {
      return null
    }

    const showData = responseData.data?.show as Record<string, unknown> | undefined
    if (!showData) {
      logger.warn({ showId, mode }, 'AllAnime getEpisodes: no show data returned')
      return null
    }

    let episodes = (showData.availableEpisodesDetail as Record<string, string[]> | undefined)?.[
      mode
    ]
    if (!episodes || episodes.length === 0) {
      const total = (showData.episodeCount as number) || 0
      if (total > 0) {
        episodes = Array.from({ length: total }, (_, i) => String(i + 1))
      }
    }

    const episodeDetails: EpisodeDetails = {
      episodes: episodes || [],
      description: (showData.description as string) || '',
    }
    this.cache.set(cacheKey, episodeDetails)
    return episodeDetails
  }

  async getSkipTimes(showId: string, episodeNumber: string): Promise<SkipIntervals> {
    try {
      const fullQuery = `query($showId: String!) { show(_id: $showId) { malId } }`
      const variablesParam = encodeURIComponent(JSON.stringify({ showId }))
      const queryParam = encodeURIComponent(fullQuery)
      const requestUrl = `${API_ENDPOINT}?variables=${variablesParam}&query=${queryParam}`
      const responseData = await this._request({
        method: 'GET',
        url: requestUrl,
        headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
        timeout: 10000,
      })
      const malId = responseData?.data?.show?.malId
      if (!malId) return { found: false, results: [] }
      const resp = await gotScraping({
        url: `https://api.aniskip.com/v1/skip-times/${malId}/${episodeNumber}?types=op&types=ed`,
        method: 'GET',
        headers: { 'User-Agent': USER_AGENT },
        responseType: 'text',
        timeout: { request: 5000 },
        followRedirect: true,
        throwHttpErrors: false,
      })
      return JSON.parse(resp.body) as SkipIntervals
    } catch {
      return { found: false, results: [] }
    }
  }

  async getStreamUrls(
    showId: string,
    episodeNumber: string,
    mode: 'sub' | 'dub'
  ): Promise<VideoSource[] | null> {
    const episodeQueryHash = 'f4662f4b7510b26795dd53ef824a0bf1740fbbc5d1273fab18222ac831bca8d0'

    const makeRequest = async () => {
      await this.ensureKey()
      const aaReqToken = this.makeAaReq(episodeQueryHash, 'k7')
      const variablesParam = encodeURIComponent(
        JSON.stringify({ showId, translationType: mode, episodeString: episodeNumber })
      )
      const extensionsParam = encodeURIComponent(
        JSON.stringify({
          persistedQuery: {
            version: 1,
            sha256Hash: episodeQueryHash,
          },
          k: 'k7',
          aaReq: aaReqToken,
        })
      )
      const requestUrl = `${API_ENDPOINT}?variables=${variablesParam}&extensions=${extensionsParam}`
      return this._request({
        method: 'GET',
        url: requestUrl,
        headers: {
          'User-Agent': USER_AGENT,
          Referer: 'https://mkissa.to/',
          Origin: 'https://mkissa.to',
          'x-build-id': AA_BUILD_ID(),
        },
        timeout: 15000,
      })
    }

    let responseData: {
      data?: {
        episode?: {
          sourceUrls?: Array<{
            sourceName: string
            sourceUrl: string
            priority?: number
            type?: string
          }>
        }
      }
    }
    try {
      responseData = await makeRequest()
    } catch (error: unknown) {
      const err = error as { message?: string }
      if (err.message === 'PersistedQueryNotFound') {
        logger.info('Episode hash expired, falling back to full query GET')
        const fullQuery = `query($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode(showId: $showId translationType: $translationType episodeString: $episodeString) { episodeString uploadDate sourceUrls thumbnail notes } }`
        const variablesParam = encodeURIComponent(
          JSON.stringify({ showId, translationType: mode, episodeString: episodeNumber })
        )
        const queryParam = encodeURIComponent(fullQuery)
        const fallbackUrl = `${API_ENDPOINT}?variables=${variablesParam}&query=${queryParam}`
        responseData = await this._request({
          method: 'GET',
          url: fallbackUrl,
          headers: getAaHeaders({ 'x-build-id': AA_BUILD_ID() }),
          timeout: 15000,
        })
      } else if (
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
              const clockResp = await gotScraping({
                url: finalUrl,
                method: 'GET',
                headers: { Referer: REFERER, 'User-Agent': USER_AGENT },
                responseType: 'text',
                timeout: { request: 10000 },
                followRedirect: true,
                throwHttpErrors: false,
              })
              const clockData = JSON.parse(clockResp.body) as RawClockData
              if (clockData && Array.isArray(clockData.links) && clockData.links.length > 0) {
                const linkData = clockData.links[0]
                if (linkData.hls) {
                  const hlsResp = await gotScraping({
                    url: linkData.link,
                    method: 'GET',
                    headers: linkData.headers || { Referer: REFERER },
                    responseType: 'text',
                    timeout: { request: 10000 },
                    followRedirect: true,
                    throwHttpErrors: false,
                  })
                  const lines = hlsResp.body.split('\n')
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
              const embedResp = await gotScraping({
                url: decryptedUrl,
                method: 'GET',
                headers: {
                  'User-Agent': USER_AGENT,
                  Referer: 'https://allanime.day/',
                },
                responseType: 'text',
                timeout: { request: 10000 },
                followRedirect: true,
                throwHttpErrors: false,
              })
              const embedHtml = embedResp.body
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
            if (source.sourceName === 'Ok') {
              const decryptedUrl = this.deobfuscateStreamUrl(source.sourceUrl)
              try {
                const embedResp = await gotScraping({
                  url: decryptedUrl,
                  method: 'GET',
                  headers: { 'User-Agent': USER_AGENT, Referer: 'https://allanime.day/' },
                  responseType: 'text',
                  timeout: { request: 10000 },
                  followRedirect: true,
                  throwHttpErrors: false,
                })
                const embedHtml = embedResp.body
                if (typeof embedHtml === 'string') {
                  const match = embedHtml.match(/data-options=['"]({.*?})['"]/)
                  if (match) {
                    const parsed = JSON.parse(match[1].replace(/&quot;/g, '"'))
                    let metadata: Record<string, unknown> | null = null
                    if (typeof parsed.flashvars?.metadata === 'string') {
                      try {
                        metadata = JSON.parse(parsed.flashvars.metadata)
                      } catch {
                        /* ignore */
                      }
                    }
                    const links: VideoLink[] = []
                    const videos = metadata?.videos as
                      | Array<{ name?: string; url?: string }>
                      | undefined
                    if (videos && Array.isArray(videos)) {
                      const qualityMap: Record<string, string> = {
                        mobile: '144p',
                        lowest: '240p',
                        low: '360p',
                        sd: '480p',
                        hd: '720p',
                        full: '1080p',
                      }
                      for (const v of videos) {
                        if (
                          v.url &&
                          !v.url.includes('disallowed') &&
                          v.name &&
                          qualityMap[v.name]
                        ) {
                          links.push({
                            resolutionStr: qualityMap[v.name],
                            link: v.url,
                            hls: false,
                            headers: { Referer: 'https://ok.ru/' },
                          })
                        }
                      }
                    }
                    if (links.length === 0) {
                      const hlsUrl =
                        metadata?.ondemandHls || metadata?.hlsManifestUrl || parsed.ondemandHls
                      if (hlsUrl) {
                        links.push({
                          resolutionStr: 'Auto',
                          link: hlsUrl as string,
                          hls: true,
                          headers: { Referer: 'https://ok.ru/' },
                        })
                      }
                    }
                    if (links.length > 0) {
                      return {
                        sourceName: 'Ok',
                        links,
                        type: 'player',
                      }
                    }
                  }
                }
              } catch (e) {
                // ignore, fall through to iframe
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
