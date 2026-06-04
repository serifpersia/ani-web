import * as cheerio from 'cheerio'
import NodeCache from 'node-cache'

import {
  Provider,
  Show,
  VideoSource,
  EpisodeDetails,
  SkipIntervals,
  SearchOptions,
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

interface AnimePaheApiResponse<T> {
  data?: T[]
  results?: T[]
  items?: T[]
  last_page?: number
  lastPage?: number
}

export class AnimePaheProvider implements Provider {
  name = 'AnimePahe'
  private readonly BASE_URL = 'https://animepahe.pw'
  private readonly API_URL = 'https://animepahe.pw/api'

  private cache: NodeCache

  constructor(cache: NodeCache) {
    this.cache = cache
  }

  private getRequestHeaders(isApi: boolean = false): Record<string, string> {
    const cookies = {
      cf_clearance:
        'Zs5bEtFKOizqftnXnmbGhQq7xNBGamfBNXrwBSNEoak-1780570525-1.2.1.1-wv0N0hIieBy_YRuiZWJ46tnHS445_Cazdo3W21XgEx3FVEaclWCmFkAy7_RRObj4uuSqAkg50uusNvz6QmyGiATnqCvRaLbB5tPI_bW4EG2G2ww1AC2._wxkk6yh4xpeKRD8GQGvXw5I2klTKicPVYwVc.bItn173EJw3CjHtvtRe7e51cp78l7WwQVmMlUGt.U2X2AI3yDag0RoJk8GOBrJFBHoqKnbujMO94OrQQEb3BLP17aV.kPaL.C5FviJNRST1y9B_OOvaTPi2ODJGNDLXpyK0GiXOVdEf25t.jYymysZsPcApMo45MlT7HiX7IGVTlCDnnUNocVk9XSbDujQR.BzqpJff5CWM6IYiznUbniNXv2cJHvZQ22RPnuuRGUuZrVu6PJvRVODMYQLKABhbq6zqj2XutSgWVbI42c',
      'XSRF-TOKEN':
        'eyJpdiI6IkNDVmU4WFdiaHhTY1VpSU94VGJSRXc9PSIsInZhbHVlIjoiWjRCK082MjBYU01OSnFhSEl3bEJNQWJIMys1RkxtYlYwZm96NEZBQW9IVzVYbVBZWDhDWjRvRTlrUXpyOUlVaDEvSmJYczNheHhYb2RxSVNrRjl3Z1lqeEs2SS9JT3BzcWlILytYNjRPdGZ6MFo5ZDZGWUZRcXpFcUFZMUV2N3ciLCJtYWMiOiI4NDgwMmNkZTdjZjU0YmQ3NTBhOGQ4MzJhZDU3MWUwODZhYzBjNTNjNzg1M2M4MjczNDdjODU4OWZmNTQ4ODA2IiwidGFnIjoiIn0%3D',
      animepahe_session:
        'eyJpdiI6ImFIeGFKNmhkQ0MyZlowTEdPcmdFNnc9PSIsInZhbHVlIjoia0pHSVFTb1NXNWZqMkpqd0YxNUZIZFkvSjJWREpNbDBtMkY2Zk9KTysrNzVRKzc3RGl0TVNDWFpMekxQdmxmYlFkTno2OVBMQURQY2NacmRXQVU0YUhvTlNxamdNSEZ2R01mNXg4VG5zL3NFYUlHT01CcllsREF4UzEydlJHa2siLCJtYWMiOiI0NDM5ZDIzOGM3YmUwZjJmNGFlYzkyNmM1NzM4ZGJkZTUwZjE3YTMwZGM2NzVkMWQ3OTRhMTUwMjJmZmJlYjBhIiwidGFnIjoiIn0%3D',
      SERVERID: 'pong',
      latest: '6745',
      res: '1080',
      aud: 'jpn',
      av1: '0',
    }

    const cookieStr = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')

    const userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:151.0) Gecko/20100101 Firefox/151.0'

    const headers: Record<string, string> = {
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: `${this.BASE_URL}/`,
      Origin: this.BASE_URL,
      Cookie: cookieStr,
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1',
    }

    if (isApi) {
      headers['X-Requested-With'] = 'XMLHttpRequest'
      headers['Accept'] = 'application/json, text/javascript, */*; q=0.01'
      headers['Sec-Fetch-Dest'] = 'empty'
      headers['Sec-Fetch-Mode'] = 'cors'
      headers['Sec-Fetch-Site'] = 'same-origin'
    }

    return headers
  }

  private async fetchText(url: string, isApi: boolean = false): Promise<string> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getRequestHeaders(isApi),
      })

      const text = await response.text()

      if (!response.ok) {
        if (response.status === 403 || text.includes('DDoS-Guard')) {
          logger.error('DDoS-Guard blocked the request! Check AnimePahe cookies.')
        }
        throw new Error(`HTTP ${response.status}`)
      }

      return text
    } catch (error) {
      logger.error({ url, error: (error as Error).message }, 'AnimePahe Fetch failed')
      throw error
    }
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    const data = await this.fetchText(url, true)
    try {
      return JSON.parse(data) as T
    } catch {
      logger.error({ url }, 'Failed to parse AnimePahe JSON')
      return null
    }
  }

  async search(options: SearchOptions): Promise<Show[]> {
    try {
      const q = options.query || ''
      const url = `${this.API_URL}?m=search&q=${encodeURIComponent(q)}`
      const data = await this.fetchJson<AnimePaheApiResponse<AnimePaheSearchResult>>(url)
      if (!data) return []

      const items = (data.data || data.results || data.items || []) as AnimePaheSearchResult[]
      return items.map((a) => ({
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

  async getEpisodes(showId: string, _mode: 'sub' | 'dub'): Promise<EpisodeDetails | null> {
    try {
      const firstPageUrl = `${this.API_URL}?m=release&id=${showId}&sort=episode_asc&page=1`
      const firstPageData =
        await this.fetchJson<AnimePaheApiResponse<AnimePaheEpisode>>(firstPageUrl)
      if (!firstPageData) return null

      let episodes = (firstPageData.data || firstPageData.results || []) as AnimePaheEpisode[]
      const lastPage = Number(firstPageData.last_page || firstPageData.lastPage || 1)

      for (let p = 2; p <= lastPage; p++) {
        const pageUrl = `${this.API_URL}?m=release&id=${showId}&sort=episode_asc&page=${p}`
        const pageData = await this.fetchJson<AnimePaheApiResponse<AnimePaheEpisode>>(pageUrl)
        if (pageData) {
          episodes = episodes.concat(
            (pageData.data || pageData.results || []) as AnimePaheEpisode[]
          )
        }
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
    let cachedMap = this.cache.get<Record<string, string>>(cacheKey)

    if (!cachedMap) {
      await this.getEpisodes(showId, 'sub')
      cachedMap = this.cache.get<Record<string, string>>(cacheKey)
    }

    if (!cachedMap) return null
    if (cachedMap[episodeNumber]) return cachedMap[episodeNumber]

    const target = parseFloat(episodeNumber)
    const keys = Object.keys(cachedMap)

    for (const key of keys) {
      if (parseFloat(key) === target) return cachedMap[key]
    }

    // Fallback search
    const sorted = keys.sort((a, b) => Number(a) - Number(b))
    const first = Number(sorted[0])

    if (target < first) {
      const idx = Math.floor(target) - 1
      if (idx >= 0 && idx < sorted.length) return cachedMap[sorted[idx]]
    }

    return null
  }

  async getStreamUrls(
    showId: string,
    episodeNumber: string,
    mode: 'sub' | 'dub'
  ): Promise<VideoSource[] | null> {
    try {
      const epSession = await this.getEpisodeSession(showId, episodeNumber)
      if (!epSession) return null

      const sources = await this.getSources(showId, epSession)
      const results: VideoSource[] = []

      const isDubSource = (audio: string) => audio.includes('eng') || audio.includes('dub')

      for (const src of sources) {
        const audio = (src.audio || '').toLowerCase()
        const sourceMode = isDubSource(audio) ? 'dub' : 'sub'

        if (sourceMode !== mode) continue

        const label = src.fansub
          ? `${src.quality || 'Auto'} - ${src.fansub} (${sourceMode.toUpperCase()})`
          : `${src.quality || 'Auto'} (${sourceMode.toUpperCase()})`

        results.push({
          sourceName: label,
          links: [
            {
              resolutionStr: src.quality || 'Auto',
              link: `/api/embed-proxy?url=${encodeURIComponent(src.url)}`,
              hls: false,
            },
          ],
          type: 'iframe',
          actualEpisodeNumber: episodeNumber,
        })
      }

      return results.length > 0 ? results : null
    } catch {
      return null
    }
  }

  private async getSources(
    animeSession: string,
    episodeSession: string
  ): Promise<AnimePaheVideoSource[]> {
    try {
      const playUrl = `${this.BASE_URL}/play/${animeSession}/${episodeSession}`
      const html = await this.fetchText(playUrl)
      const $ = cheerio.load(html)

      const sources: AnimePaheVideoSource[] = []

      $('[data-src]').each((_, el) => {
        const src = $(el).attr('data-src')?.trim()
        if (!src || !/kwik/i.test(src)) return

        const res = $(el).attr('data-resolution') || $(el).attr('data-res')
        sources.push({
          url: src,
          quality: res ? (res.endsWith('p') ? res : `${res}p`) : null,
          fansub: $(el).attr('data-fansub') ?? null,
          audio: $(el).attr('data-audio') ?? null,
        })
      })

      const unique = Array.from(new Map(sources.map((s) => [s.url, s])).values())
      unique.sort((a, b) => {
        const qa = parseInt(a.quality || '0') || 0
        const qb = parseInt(b.quality || '0') || 0
        return qb - qa
      })

      return unique
    } catch {
      return []
    }
  }

  async resolveKwik(_kwikUrl: string): Promise<{ m3u8: string; referer: string }> {
    return { m3u8: '', referer: '' }
  }

  async getShowMeta(_showId: string): Promise<Partial<Show> | null> {
    return null
  }
  async getPopular(
    _timeframe: 'daily' | 'weekly' | 'monthly' | 'all',
    _page?: number,
    _size?: number
  ): Promise<Show[]> {
    return []
  }
  async getSchedule(_date: Date): Promise<Show[]> {
    return []
  }
  async getSeasonal(_page: number): Promise<Show[]> {
    return []
  }
  async getLatestReleases(_page?: number, _size?: number): Promise<Show[]> {
    return []
  }
  async getSkipTimes(_showId: string, _episodeNumber: string): Promise<SkipIntervals> {
    return { found: false, results: [] }
  }
}
