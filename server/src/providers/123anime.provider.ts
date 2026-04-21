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

interface ApiAnime {
  id?: string
  title: string
  thumbnail?: string
  image?: string
  poster?: string
  type?: string
  episode?: number
}

interface ApiStreamData {
  success: boolean
  data?: {
    streaming_link?: string
    stream?: string
    url?: string
  }
  error?: string
}

const BASE_URL = 'https://shirayuki-scrapper-api.onrender.com'

export class _123AnimeProvider implements Provider {
  name = '123Anime'

  private cache: NodeCache

  constructor(cache: NodeCache) {
    this.cache = cache
  }

  private createSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  async search(options: SearchOptions): Promise<Show[]> {
    try {
      const query = options.query || ''
      const url = `${BASE_URL}/search?keyword=${encodeURIComponent(query)}`

      const response = await fetch(url)
      if (!response.ok) {
        return []
      }

      const data = (await response.json()) as {
        success: boolean
        data?: ApiAnime[]
        error?: string
      }

      if (!data.success || !data.data) {
        return []
      }

      return (data.data || []).map((anime: ApiAnime) => ({
        _id: anime.id || this.createSlug(anime.title),
        id: anime.id || this.createSlug(anime.title),
        name: anime.title,
        englishName: anime.title,
        thumbnail: anime.thumbnail || anime.image || anime.poster,
        type: anime.type,
        availableEpisodesDetail: {
          sub: Array.from({ length: anime.episode || 0 }, (_, i) => (i + 1).toString()),
          dub: [],
        },
      }))
    } catch (error) {
      logger.error({ err: error }, '123Anime search failed')
      return []
    }
  }

  async getEpisodes(showId: string): Promise<EpisodeDetails | null> {
    try {
      const cacheKey = `123anime_eps_${showId}`
      const cached = this.cache.get<EpisodeDetails>(cacheKey)
      if (cached) return cached

      const results = await this.search({ query: showId.replace(/-/g, ' ') })
      const show = results.find((s) => s.id === showId || s._id === showId)

      if (!show || !show.availableEpisodesDetail) {
        return null
      }

      const episodes = show.availableEpisodesDetail.sub || []

      const result: EpisodeDetails = {
        episodes,
        description: '',
      }

      this.cache.set(cacheKey, result, 3600)
      return result
    } catch (error) {
      logger.error({ err: error, showId }, '123Anime getEpisodes failed')
      return null
    }
  }

  async getStreamUrls(showId: string, episodeNumber: string): Promise<VideoSource[] | null> {
    try {
      const query = showId.replace(/-/g, ' ')
      const searchResults = await this.search({ query })

      if (!searchResults || searchResults.length === 0) {
        return null
      }

      const bestMatch = searchResults[0]
      const animeId = bestMatch.id || bestMatch._id

      const url = `${BASE_URL}/episode-stream?id=${animeId}&ep=${episodeNumber}`

      const response = await fetch(url)
      if (!response.ok) {
        return null
      }

      const data = (await response.json()) as ApiStreamData

      if (!data.success || !data.data) {
        return null
      }

      const streamingLink = data.data['streaming_link'] || data.data['stream'] || data.data['url']
      if (!streamingLink) {
        return null
      }

      let finalUrl = streamingLink
      if (!streamingLink.includes('?') && !streamingLink.endsWith('/')) {
        finalUrl = streamingLink + '/'
      }
      finalUrl += '?autoplay=1'

      return [
        {
          sourceName: '123Anime',
          links: [
            {
              resolutionStr: 'auto',
              link: finalUrl,
              hls: false,
            },
          ],
          type: 'iframe',
        },
      ]
    } catch (error) {
      logger.error({ err: error, showId, episodeNumber }, '123Anime getStreamUrls failed')
      return null
    }
  }

  async getShowMeta(showId: string): Promise<Partial<Show> | null> {
    const results = await this.search({ query: showId.replace(/-/g, ' ') })
    return results.find((s) => s.id === showId || s._id === showId) || null
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
