import NodeCache from 'node-cache'
import * as cheerio from 'cheerio'
import {
  Provider,
  Show,
  VideoSource,
  EpisodeDetails,
  SkipIntervals,
  SearchOptions,
  ShowDetails,
  AllmangaDetails,
  VideoLink,
  SubtitleTrack,
} from './provider.interface'
import logger from '../logger'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, healthiest/537.36) Chrome/120.0.0.0 Safari/537.36'
const DEFAULT_CORS_HEADERS = {
  Referer: 'https://animeya.cc',
  Origin: 'https://animeya.cc',
  'User-Agent': UA,
}

interface AnimeyaEpisode {
  id: number
  episodeNumber: number
  title: string
  isFiller: boolean
}

interface AnimeyaShowInfo {
  id: string
  title: string
  cover: string
  description: string
  episodes: AnimeyaEpisode[]
}

interface AnimeyaPlayer {
  name: string
  url: string
  type?: string
  quality?: string
  langue?: string
  subType?: string
  subtitles?: unknown[]
  tracks?: unknown[]
  captions?: unknown[]
}

interface AnimeyaCardProps {
  slug: string
  title: string
  cover: string
  type: string
}

export class AnimeyaProvider implements Provider {
  name = 'Animeya'

  private cache: NodeCache

  constructor(cache: NodeCache) {
    this.cache = cache
  }

  private async fetchText(url: string, referer?: string): Promise<string> {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Referer: referer || 'https://animeya.cc',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(30000),
    })
    return res.text()
  }

  private extractM3u8FromText(text: string): string[] {
    const matches = text.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi) || []
    return Array.from(new Set(matches.map((m) => m.replace(/\\\//g, '/'))))
  }

  private async extractEpisodeHls(url: string) {
    if (!url) {
      return {
        sourceUrl: url,
        hls: [],
        inspected: [],
        cors: true,
        headers: DEFAULT_CORS_HEADERS,
        note: 'Missing url',
      }
    }

    const inspected: string[] = [url]
    const hls = new Set<string>()

    try {
      const html = await this.fetchText(url)
      this.extractM3u8FromText(html).forEach((u) => hls.add(u))

      const $ = cheerio.load(html)
      const scriptBlob = $('script')
        .map((_, s) => $(s).html() || '')
        .get()
        .join('\n')
      this.extractM3u8FromText(scriptBlob).forEach((u) => hls.add(u))

      $('iframe[src], script[src], source[src], video source[src], a[href]').each((_, el) => {
        const raw = $(el).attr('src') || $(el).attr('href')
        if (!raw) return
        if (!/^https?:\/\//i.test(raw)) return
        if (/\.(js|css|png|jpg|jpeg|svg|woff2?|ttf|mp4)(\?|$)/i.test(raw)) return
        inspected.push(raw)
      })

      for (const candidate of Array.from(new Set(inspected)).slice(0, 12)) {
        if (candidate === url) continue
        try {
          const page = await this.fetchText(candidate, url)
          this.extractM3u8FromText(page).forEach((u) => hls.add(u))
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }

    return {
      sourceUrl: url,
      hls: Array.from(hls),
      inspected: Array.from(new Set(inspected)),
      cors: true,
      headers: DEFAULT_CORS_HEADERS,
    }
  }

  private async fetchRetry(url: string, options: RequestInit = {}, retries = 3): Promise<Response> {
    let lastErr: Error | null = null
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, {
          ...options,
          signal: AbortSignal.timeout(30000),
          headers: { ...options.headers, 'User-Agent': UA },
        })
        if (res.ok) return res
        if (res.status === 404) throw new Error('Status 404')
        lastErr = new Error(`Status ${res.status}`)
      } catch (e) {
        if (e instanceof Error && e.message === 'Status 404') throw e
        lastErr = e as Error
      }
      if (i < retries - 1) await new Promise((r) => setTimeout(r, 1000))
    }
    throw lastErr!
  }

  private parseRSCStream(html: string): unknown[] {
    const lines: unknown[] = []
    const regex = /self\.__next_f\.push\(\[(\d+|0),"((?:[^"\\]|\\.)*)"\]\)/g
    let m: RegExpExecArray | null
    while ((m = regex.exec(html)) !== null) {
      let raw = m[2]
      try {
        raw = JSON.parse(`"${raw}"`)
      } catch {
        raw = raw.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\')
      }
      if (typeof raw !== 'string') continue
      const idx = raw.indexOf(':')
      if (idx === -1) continue
      const val = raw.substring(idx + 1)
      try {
        lines.push(val.trim().startsWith('[') || val.trim().startsWith('{') ? JSON.parse(val) : val)
      } catch {
        lines.push(val)
      }
    }
    return lines
  }

  private deepSearch(
    obj: unknown,
    pred: (v: Record<string, unknown>) => boolean,
    results: unknown[] = []
  ): unknown[] {
    if (!obj || typeof obj !== 'object') return results
    try {
      const record = obj as Record<string, unknown>
      if (pred(record)) results.push(record)
      if (Array.isArray(obj)) {
        for (const x of obj) this.deepSearch(x, pred, results)
      } else {
        for (const k in record) this.deepSearch(record[k], pred, results)
      }
    } catch {
      // ignore
    }
    return results
  }

  private extractCard(node: Record<string, unknown>): AnimeyaCardProps | null {
    try {
      if (!node.href || typeof node.href !== 'string' || !node.href.startsWith('/watch/'))
        return null
      const slug = node.href.split('/watch/')[1]
      if (!slug) return null
      const props: AnimeyaCardProps = { slug, title: 'Unknown', cover: '', type: 'TV' }
      const coverNodes = this.deepSearch(
        node,
        (o) =>
          !!(
            (o?.cover &&
              typeof o.cover === 'object' &&
              (typeof (o.cover as Record<string, unknown>).extraLarge === 'string' ||
                typeof (o.cover as Record<string, unknown>).large === 'string' ||
                typeof (o.cover as Record<string, unknown>).medium === 'string')) ||
            typeof o?.image === 'string' ||
            typeof o?.bannerImage === 'string'
          )
      )
      const coverNode = coverNodes[0] as Record<string, unknown> | undefined
      if (coverNode?.cover && typeof coverNode.cover === 'object') {
        const c = coverNode.cover as Record<string, unknown>
        props.cover = (c.extraLarge as string) || (c.large as string) || (c.medium as string) || ''
      }
      if (!props.cover && typeof coverNode?.image === 'string') props.cover = coverNode.image
      if (!props.cover && typeof coverNode?.bannerImage === 'string')
        props.cover = coverNode.bannerImage
      const titleNodes = this.deepSearch(
        node,
        (o) =>
          !!(
            o?.title &&
            typeof o.title === 'object' &&
            (typeof (o.title as Record<string, unknown>).english === 'string' ||
              typeof (o.title as Record<string, unknown>).romaji === 'string')
          )
      )
      const titleNode = titleNodes[0] as Record<string, unknown> | undefined
      if (titleNode?.title && typeof titleNode.title === 'object') {
        const t = titleNode.title as Record<string, unknown>
        props.title =
          (t.english as string) || (t.romaji as string) || (t.native as string) || 'Unknown'
      }
      if (!props.cover) {
        const serialized = JSON.stringify(node).replace(/\\\//g, '/')
        const m = serialized.match(/https?:\/\/[^"\s]+anilistcdn[^"\s]+\.(?:jpg|jpeg|png|webp)/i)
        if (m) props.cover = m[0]
      }
      if (!props.cover && !props.title) return null
      return props
    } catch {
      return null
    }
  }

  private cleanText(value: string | undefined | null): string {
    return (value || '').replace(/\s+/g, ' ').trim()
  }

  private collectSubtitleTracks(
    value: unknown,
    fallbackLang = 'Subtitles'
  ): Array<{ label: string; url: string; lang?: string; kind?: string; file?: string }> {
    const collected: Array<{
      label: string
      url: string
      lang?: string
      kind?: string
      file?: string
    }> = []
    const seen = new Set<string>()

    const walk = (node: unknown, inheritedLang?: string) => {
      if (!node) return
      if (Array.isArray(node)) {
        for (const item of node) walk(item, inheritedLang)
        return
      }
      if (typeof node !== 'object') return

      const record = node as Record<string, unknown>
      const url = (record.url ||
        record.src ||
        record.file ||
        record.subtitleUrl ||
        record.subUrl) as string | undefined
      if (typeof url === 'string' && url.trim()) {
        const lang =
          String(
            record.lang || record.language || record.label || inheritedLang || fallbackLang
          ).trim() || fallbackLang
        const label = String(record.label || record.name || lang).trim() || lang
        const key = `${lang}|${label}|${url}`.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          collected.push({
            label,
            url: url.trim(),
            lang,
            kind: record.kind as string | undefined,
            file: typeof record.file === 'string' ? record.file.trim() : url.trim(),
          })
        }
      }

      for (const key of ['subtitles', 'subtitle', 'tracks', 'captions']) {
        const child = record[key]
        if (child)
          walk(
            child,
            String(record.lang || record.language || record.label || inheritedLang || fallbackLang)
          )
      }
    }

    walk(value)
    return collected
  }

  async search(options: SearchOptions): Promise<Show[]> {
    try {
      const query = options.query || ''
      if (!query) return []

      const res = await this.fetchRetry(
        `https://animeya.cc/browser?search=${encodeURIComponent(query)}`
      )
      const html = await res.text()
      const rscObjects = this.parseRSCStream(html)
      const results: Show[] = []
      const seen = new Set<string>()

      for (const obj of rscObjects) {
        this.deepSearch(
          obj,
          (o) => !!(o?.href && typeof o.href === 'string' && o.href.startsWith('/watch/'))
        ).forEach((n) => {
          const c = this.extractCard(n as Record<string, unknown>)
          if (c && !seen.has(c.slug)) {
            seen.add(c.slug)
            results.push({
              _id: c.slug,
              id: c.slug,
              name: c.title,
              englishName: c.title,
              thumbnail: c.cover,
              type: c.type || 'TV',
              availableEpisodesDetail: {
                sub: [],
                dub: [],
              },
            })
          }
        })
      }
      return results
    } catch (error) {
      logger.error({ err: error }, 'Animeya search failed')
      return []
    }
  }

  private async getInfoInternal(slug: string): Promise<AnimeyaShowInfo> {
    const res = await this.fetchRetry(`https://animeya.cc/watch/${slug}`)
    const html = await res.text()
    const rscObjects = this.parseRSCStream(html)
    const details: AnimeyaShowInfo = {
      id: slug,
      title: slug,
      cover: '',
      description: '',
      episodes: [],
    }
    const htmlTitle = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() || ''
    const ogImage =
      html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1]?.trim() || ''
    const ogDescription =
      html
        .match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i)?.[1]
        ?.trim() || ''
    const metaDescription =
      html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1]?.trim() || ''
    const notFoundPage =
      /404:\s*This page could not be found\./i.test(htmlTitle) ||
      /404:\s*This page could not be found\./i.test(html)

    for (const obj of rscObjects) {
      const epLists = this.deepSearch(
        obj,
        (o) =>
          !!(
            Array.isArray(o) &&
            o.length > 0 &&
            typeof (o[0] as Record<string, unknown>)?.episodeNumber === 'number'
          )
      ) as AnimeyaEpisode[][]

      if (epLists.length > 0) {
        epLists.sort((a, b) => b.length - a.length)
        details.episodes = epLists[0].map((ep) => ({
          id: ep.id,
          episodeNumber: ep.episodeNumber,
          title: ep.title,
          isFiller: ep.isFiller,
        }))
      }
      if (details.title === slug && !notFoundPage) {
        const titleNodes = this.deepSearch(
          obj,
          (o) => !!(Array.isArray(o) && o[0] === '$' && o[1] === 'title')
        ) as unknown[][]
        if (titleNodes.length > 0) {
          const node = titleNodes[0][3] as Record<string, unknown> | undefined
          const t = node?.children as string | undefined
          if (t) details.title = t.replace(' | Animeya', '')
        }
      }
      if (!details.cover) {
        const coverNodes = this.deepSearch(
          obj,
          (o) =>
            !!(
              o?.cover &&
              typeof o.cover === 'object' &&
              (typeof (o.cover as Record<string, unknown>).large === 'string' ||
                typeof (o.cover as Record<string, unknown>).extraLarge === 'string')
            )
        )
        const cn = coverNodes[0] as Record<string, unknown> | undefined
        if (cn?.cover && typeof cn.cover === 'object') {
          const c = cn.cover as Record<string, unknown>
          details.cover = (c.extraLarge as string) || (c.large as string) || ''
        }
      }
      if (!details.description) {
        const md = this.deepSearch(
          obj,
          (o) => !!(Array.isArray(o) && o[0] === '$' && o[1] === 'meta' && o[2] === 'description')
        ) as unknown[][]
        if (md.length > 0) {
          const node = md[0][3] as Record<string, unknown> | undefined
          details.description = (node?.content as string) || ''
        }
      }
    }
    const unique = new Map<number, AnimeyaEpisode>()
    details.episodes.forEach((ep) => unique.set(ep.episodeNumber, ep))
    details.episodes = Array.from(unique.values()).sort((a, b) => a.episodeNumber - b.episodeNumber)
    if (!details.cover && ogImage) details.cover = ogImage
    if (!details.description) {
      const jsonDesc = html.match(/"description"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i)?.[1]
      if (jsonDesc) {
        try {
          details.description = this.cleanText(JSON.parse(`"${jsonDesc}"`))
        } catch {
          details.description = this.cleanText(jsonDesc.replace(/\\n/g, ' '))
        }
      }
    }
    if (!details.description) {
      details.description = this.cleanText(ogDescription || metaDescription)
    }
    if (notFoundPage && details.episodes.length === 0) throw new Error('Status 404')
    return details
  }

  private async getEpisodeSourcesInternal(episodeId: string) {
    const trpcUrl = `https://animeya.cc/api/trpc/episode.getEpisodeFullById?batch=1&input=${encodeURIComponent(
      JSON.stringify({ '0': { json: parseInt(episodeId, 10) } })
    )}`
    const res = await this.fetchRetry(trpcUrl)
    const json = (await res.json()) as unknown[]
    const firstResult = json[0] as Record<string, unknown> | undefined
    const result = firstResult?.result as Record<string, unknown> | undefined
    const data = result?.data as Record<string, unknown> | undefined
    const episodeData = data?.json as Record<string, unknown> | undefined

    if (!episodeData) throw new Error('Episode not found')
    const sources = ((episodeData.players as AnimeyaPlayer[]) || []).map((p) => ({
      name: p.name || 'Unknown',
      url: p.url,
      type: p.type || (p.url?.includes('.m3u8') ? 'HLS' : 'EMBED'),
      quality: p.quality || '720p',
      langue: p.langue || 'ENG',
      subType: p.subType || 'NONE',
    }))
    const subtitles = [
      ...this.collectSubtitleTracks(episodeData.subtitles),
      ...this.collectSubtitleTracks(episodeData.tracks),
      ...this.collectSubtitleTracks(episodeData.players),
      ...(Array.isArray(episodeData.players)
        ? (episodeData.players as AnimeyaPlayer[]).flatMap((player) =>
            this.collectSubtitleTracks(player?.subtitles || player?.tracks || player?.captions)
          )
        : []),
    ]
    return {
      episode: {
        id: episodeData.id as number,
        title: episodeData.title as string,
        number: episodeData.episodeNumber as number,
      },
      sources,
      subtitles,
    }
  }

  async getEpisodes(showId: string, mode: 'sub' | 'dub'): Promise<EpisodeDetails | null> {
    try {
      const cacheKey = `animeya_eps_${showId}`
      const cached = this.cache.get<EpisodeDetails>(cacheKey)
      if (cached) return cached

      const info = await this.getInfoInternal(showId)
      if (!info || !info.episodes) return null

      const episodes = info.episodes.map((ep) => String(ep.episodeNumber))
      const result: EpisodeDetails = {
        episodes,
        description: info.description || '',
      }

      this.cache.set(cacheKey, result, 3600)
      return result
    } catch (error) {
      logger.error({ err: error, showId }, 'Animeya getEpisodes failed')
      return null
    }
  }

  async getStreamUrls(
    showId: string,
    episodeNumber: string,
    mode: 'sub' | 'dub'
  ): Promise<VideoSource[] | null> {
    try {
      const info = await this.getInfoInternal(showId)
      const episode = info.episodes.find((ep) => String(ep.episodeNumber) === episodeNumber)
      if (!episode || !episode.id) return null

      const sourcesData = await this.getEpisodeSourcesInternal(String(episode.id))
      const processedSources: VideoSource[] = []

      for (const source of sourcesData.sources) {
        const subType = (source.subType || '').toUpperCase()
        const langue = (source.langue || '').toUpperCase()

        const isSub = ['SOFT', 'HARD', 'SUB'].includes(subType)
        const isDub = subType === 'DUB' || (subType === 'NONE' && langue === 'ENG')

        if (mode === 'dub' && !isDub) continue
        if (mode === 'sub' && isDub) continue

        if (source.type === 'HLS' || source.url.includes('.m3u8')) {
          processedSources.push({
            sourceName: source.name,
            type: 'player',
            links: [
              {
                resolutionStr: source.quality || 'Auto',
                link: source.url,
                hls: true,
                headers: {
                  Referer: 'https://animeya.cc',
                  'User-Agent': UA,
                },
              },
            ],
            subtitles: sourcesData.subtitles.map((s) => ({
              language: s.lang || 'English',
              label: s.label || 'English',
              url: s.url,
            })),
          })
        } else if (source.name === 'Mp4') {
          try {
            const embedHtml = await this.fetchText(source.url, 'https://animeya.cc/')
            const match = embedHtml.match(/src:\s*"(https:\/\/.*?\.mp4)"/)
            if (match) {
              processedSources.push({
                sourceName: source.name,
                type: 'player',
                links: [
                  {
                    resolutionStr: 'Default',
                    link: match[1],
                    hls: false,
                    headers: { Referer: 'https://www.mp4upload.com/' },
                  },
                ],
                subtitles: sourcesData.subtitles.map((s) => ({
                  language: s.lang || 'English',
                  label: s.label || 'English',
                  url: s.url,
                })),
              })
            } else {
              processedSources.push({
                sourceName: source.name,
                type: 'iframe',
                links: [{ resolutionStr: 'iframe', link: source.url, hls: false }],
              })
            }
          } catch {
            processedSources.push({
              sourceName: source.name,
              type: 'iframe',
              links: [{ resolutionStr: 'iframe', link: source.url, hls: false }],
            })
          }
        } else if (source.name === 'Ok') {
          processedSources.push({
            sourceName: source.name,
            type: 'iframe',
            links: [{ resolutionStr: 'iframe', link: source.url, hls: false }],
          })
        } else if (
          source.type === 'EMBED' ||
          source.url.includes('iframe') ||
          source.url.includes('embed')
        ) {
          try {
            const extracted = await this.extractEpisodeHls(source.url)
            if (extracted && extracted.hls && extracted.hls.length > 0) {
              processedSources.push({
                sourceName: `${source.name} (Extracted)`,
                type: 'player',
                links: extracted.hls.map((hlsUrl) => ({
                  resolutionStr: 'Auto',
                  link: hlsUrl,
                  hls: true,
                  headers: extracted.headers,
                })),
                subtitles: sourcesData.subtitles.map((s) => ({
                  language: s.lang || 'English',
                  label: s.label || 'English',
                  url: s.url,
                })),
              })
            } else {
              processedSources.push({
                sourceName: source.name,
                type: 'iframe',
                links: [
                  {
                    resolutionStr: 'iframe',
                    link: source.url,
                    hls: false,
                  },
                ],
              })
            }
          } catch {
            processedSources.push({
              sourceName: source.name,
              type: 'iframe',
              links: [
                {
                  resolutionStr: 'iframe',
                  link: source.url,
                  hls: false,
                },
              ],
            })
          }
        }
      }

      return processedSources.length > 0 ? processedSources : null
    } catch (error) {
      logger.error({ err: error, showId, episodeNumber }, 'Animeya getStreamUrls failed')
      return null
    }
  }

  async getShowMeta(showId: string): Promise<Partial<Show> | null> {
    try {
      const info = await this.getInfoInternal(showId)
      return {
        _id: info.id,
        id: info.id,
        name: info.title,
        englishName: info.title,
        thumbnail: info.cover,
        description: info.description,
        availableEpisodesDetail: {
          sub: info.episodes.map((ep) => String(ep.episodeNumber)),
          dub: [],
        },
      }
    } catch (error) {
      logger.error({ err: error, showId }, 'Animeya getShowMeta failed')
      return null
    }
  }

  async getPopular(timeframe: 'daily' | 'weekly' | 'monthly' | 'all'): Promise<Show[]> {
    return []
  }

  async getSchedule(date: Date): Promise<Show[]> {
    return []
  }

  async getSeasonal(page: number): Promise<Show[]> {
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
