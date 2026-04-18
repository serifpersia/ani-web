import * as cheerio from 'cheerio'
import NodeCache from 'node-cache'

import {
  Provider,
  Show,
  VideoSource,
  EpisodeDetails,
  SkipIntervals,
  SearchOptions,
  ShowDetails,
  AllmangaDetails,
} from './provider.interface'
import logger from '../logger'

interface AnimePaheSearchResult {
  session: string
  title: string
  name?: string
  poster?: string
  image?: string
  type?: string
  year?: number
}

interface AnimePaheEpisode {
  episode?: number
  number?: number
  session?: string
  release_session?: string
}

interface AnimePaheVideoSource {
  url: string
  quality: string | null
  fansub: string | null
  audio: string | null
}

export class AnimePaheProvider implements Provider {
  name = 'AnimePahe'
  private base = 'https://animepahe.pw'
  private apiBase = 'https://animepahe.pw/api'

  private cache: NodeCache

  constructor(cache: NodeCache) {
    this.cache = cache
  }

  /**
   * Generates headers that perfectly mimic a browser to bypass passive checks.
   * Injects the DDoS-Guard cookies.
   */
  private getHeaders(isApi: boolean = false): Record<string, string> {
    // Paste your cookies directly here
    const cookies = {
      __ddg1_: '5H0114JE1p0wQHdJiV2O',
      __ddg2_: 'FxnuwLkvPnXSQtPE',
      __ddg8_: 'j55RhixQcxVPfvqt',
      __ddg9_: '51.158.195.12',
      __ddg10_: '1769167572',
      __ddgid_: 'ExAWs3AJTzpAKb8m',
      __ddgmark_: 'slbgrX6Jj2jTxuo2',
    }

    const cookieString = Object.entries(cookies)
      .map(([key, val]) => `${key}=${val}`)
      .join('; ')

    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://animepahe.pw/',
      Origin: 'https://animepahe.pw',
      Cookie: cookieString,
    }

    if (isApi) {
      headers['X-Requested-With'] = 'XMLHttpRequest'
      headers['Accept'] = 'application/json, text/javascript, */*; q=0.01'
    }

    return headers
  }

  private async get(url: string, isApi: boolean = false): Promise<string> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(isApi),
      })

      const text = await response.text()

      if (!response.ok) {
        if (response.status === 403 || text.includes('DDoS-Guard')) {
          logger.error(
            'DDoS-Guard blocked the request! Your ANIMEPAHE_COOKIES in .env are likely expired.'
          )
        }
        throw new Error(`HTTP ${response.status}`)
      }

      return text
    } catch (error) {
      const err = error as Error
      logger.error({ url, err: err.message }, 'AnimePahe Fetch failed')
      throw error
    }
  }

  private async getJson(url: string): Promise<Record<string, unknown> | unknown[]> {
    const data = await this.get(url, true)
    try {
      return JSON.parse(data)
    } catch {
      logger.error({ url }, 'Failed to parse JSON (likely blocked by bot protection)')
      return {}
    }
  }

  async search(options: SearchOptions): Promise<Show[]> {
    try {
      const query = options.query || ''
      const url = `${this.apiBase}?m=search&q=${encodeURIComponent(query)}`
      const data = (await this.getJson(url)) as Record<string, unknown>

      const animeRows = (data.data || data.results || data.items || []) as AnimePaheSearchResult[]
      return animeRows.map((a) => ({
        _id: a.session,
        id: a.session,
        name: a.title || a.name || '',
        englishName: a.title,
        thumbnail: a.poster || a.image,
        type: a.type,
        year: a.year,
        session: a.session,
      }))
    } catch {
      return []
    }
  }

  async getEpisodes(showId: string): Promise<EpisodeDetails | null> {
    try {
      const firstPageUrl = `${this.apiBase}?m=release&id=${showId}&sort=episode_asc&page=1`
      const firstPageData = (await this.getJson(firstPageUrl)) as Record<string, unknown>

      let episodes = (firstPageData.data || firstPageData.results || []) as AnimePaheEpisode[]
      const lastPage = Number(firstPageData.last_page || firstPageData.lastPage || 1)

      for (let p = 2; p <= lastPage; p++) {
        const pageUrl = `${this.apiBase}?m=release&id=${showId}&sort=episode_asc&page=${p}`
        const pageData = (await this.getJson(pageUrl)) as Record<string, unknown>
        episodes = episodes.concat((pageData.data || pageData.results || []) as AnimePaheEpisode[])
      }

      const episodeMap: Record<string, string> = {}
      const episodeNumbers: string[] = []

      episodes.forEach((ep) => {
        const epNum = (ep.episode ?? ep.number ?? '').toString()
        if (epNum) {
          episodeMap[epNum] = ep.session || ep.release_session || ''
          episodeNumbers.push(epNum)
        }
      })

      this.cache.set(`animepahe_epmap_${showId}`, episodeMap, 86400)

      return {
        episodes: episodeNumbers.sort((a, b) => Number(a) - Number(b)),
        description: '',
      }
    } catch {
      return null
    }
  }

  private async getEpisodeSession(showId: string, episodeNumber: string): Promise<string | null> {
    const cacheKey = `animepahe_epmap_${showId}`
    const cachedMap = this.cache.get<Record<string, string>>(cacheKey)

    if (cachedMap && cachedMap[episodeNumber]) {
      return cachedMap[episodeNumber]
    }

    await this.getEpisodes(showId)
    const freshMap = this.cache.get<Record<string, string>>(cacheKey)
    return freshMap?.[episodeNumber] || null
  }

  async getStreamUrls(showId: string, episodeNumber: string): Promise<VideoSource[] | null> {
    try {
      const epSession = await this.getEpisodeSession(showId, episodeNumber)
      if (!epSession) return null

      const sources = await this.getSources(showId, epSession)
      const videoSources: VideoSource[] = []

      for (const src of sources) {
        const label = src.fansub
          ? `${src.quality || 'Auto'} - ${src.fansub} (${src.audio || 'jpn'})`
          : `${src.quality || 'Auto'} - ${src.audio || 'jpn'}`

        videoSources.push({
          sourceName: label,
          links: [
            {
              resolutionStr: src.quality || 'Auto',
              link: src.url, // Usually Kwik Embed URL
              hls: false,
            },
          ],
          type: 'iframe',
        })
      }

      return videoSources.length > 0 ? videoSources : null
    } catch {
      return null
    }
  }

  private async getSources(
    animeSession: string,
    episodeSession: string
  ): Promise<AnimePaheVideoSource[]> {
    try {
      const playUrl = `${this.base}/play/${animeSession}/${episodeSession}`
      const html = await this.get(playUrl)
      const $ = cheerio.load(html)

      const sources: AnimePaheVideoSource[] = []

      $('[data-src]').each((_, el) => {
        const src = $(el).attr('data-src')?.trim()
        if (!src || !/kwik/i.test(src)) return

        const resolution = $(el).attr('data-resolution') || $(el).attr('data-res')
        sources.push({
          url: src,
          quality: resolution ? (resolution.endsWith('p') ? resolution : `${resolution}p`) : null,
          fansub: $(el).attr('data-fansub') ?? null,
          audio: $(el).attr('data-audio') ?? null,
        })
      })

      const unique = Array.from(new Map(sources.map((s) => [s.url, s])).values())
      unique.sort((a, b) => {
        const qa = a.quality ? parseInt(a.quality) || 0 : 0
        const qb = b.quality ? parseInt(b.quality) || 0 : 0
        return qb - qa
      })

      return unique
    } catch {
      return []
    }
  }

  /**
   * Browser-less Kwik.cx Extractor
   * Relies entirely on Regex to break the eval() obfuscation.
   */
  async resolveKwik(kwikUrl: string): Promise<{ m3u8: string; referer: string }> {
    try {
      const fetchUrl = kwikUrl.replace('/e/', '/f/')
      const response = await fetch(fetchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://animepahe.pw/',
        },
      })

      const html = await response.text()

      if (html.includes('Just a moment')) {
        throw new Error('Kwik triggered a Cloudflare challenge.')
      }

      // Pattern 1: Direct link
      const directMatch = html.match(/(?:source|file)\s*:\s*['"]([^'"]+\.m3u8)['"]/)
      if (directMatch) return { m3u8: directMatch[1], referer: kwikUrl }

      // Pattern 2: Split-Array Obfuscation (Most common Kwik packer)
      const packedMatch = html.match(/'([^']{50,})'\.split\('\|'\)/)
      if (packedMatch) {
        const parts = packedMatch[1].split('|')
        const hash = parts.find((p) => p.length === 64 && /^[a-f0-9]+$/.test(p))
        const domain = parts.find((p) => p.includes('owocdn'))

        if (hash) {
          const cdn = domain || 'na.owocdn.top'
          return { m3u8: `https://${cdn}/stream/01/${hash}/uwu.m3u8`, referer: kwikUrl }
        }
      }

      throw new Error('Could not regex m3u8 link from Kwik HTML')
    } catch (err) {
      const error = err as Error
      logger.error({ err: error.message }, 'Kwik Resolve failed')
      return { m3u8: '', referer: kwikUrl }
    }
  }

  // Interfaces implementation
  async getShowMeta(showId: string): Promise<Partial<Show> | null> {
    return null
  }
  async getPopular(): Promise<Show[]> {
    return []
  }
  async getSchedule(): Promise<Show[]> {
    return []
  }
  async getSeasonal(): Promise<Show[]> {
    return []
  }
  async getLatestReleases(): Promise<Show[]> {
    return []
  }

  async getSkipTimes(): Promise<SkipIntervals> {
    return { found: false, results: [] }
  }

  async getShowDetails(): Promise<ShowDetails> {
    return { status: 'Unknown' }
  }

  async getAllmangaDetails(): Promise<AllmangaDetails> {
    return {
      Rating: 'N/A',
      Season: 'N/A',
      Episodes: 'N/A',
      Date: 'N/A',
      'Original Broadcast': 'N/A',
    }
  }
}
