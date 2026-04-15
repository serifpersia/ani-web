/* eslint-disable @typescript-eslint/no-explicit-any */
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

export class HiAnimeProvider implements Provider {
  name = 'HiAnime'

  private scraper: any
  private cache: NodeCache

  constructor(cache: NodeCache) {
    this.cache = cache
  }

  private async getScraper() {
    if (!this.scraper) {
      const { HiAnime } = await import('../vendor/aniwatch')
      this.scraper = new HiAnime.Scraper()
    }
    return this.scraper
  }

  async search(options: SearchOptions): Promise<Show[]> {
    try {
      const scraper = await this.getScraper()
      const data = await scraper.search(options.query || '', Number(options.page || 1))

      return (data.animes || []).map((anime: any) => ({
        _id: anime.id,
        id: anime.id,
        name: anime.name,
        englishName: anime.name,
        thumbnail: anime.poster,
        type: anime.type,
        availableEpisodesDetail: {
          sub: anime.episodes?.sub
            ? Array.from({ length: anime.episodes.sub }, (_, i) => (i + 1).toString())
            : [],
          dub: anime.episodes?.dub
            ? Array.from({ length: anime.episodes.dub }, (_, i) => (i + 1).toString())
            : [],
        },
      }))
    } catch (error) {
      logger.error({ err: error }, 'HiAnime search failed')
      return []
    }
  }

  async getPopular(timeframe: 'daily' | 'weekly' | 'monthly' | 'all'): Promise<Show[]> {
    try {
      const scraper = await this.getScraper()
      const data = await scraper.getHomePage()

      let animes: any[] = []

      if (timeframe === 'daily') animes = data.top10Animes.today
      else if (timeframe === 'weekly') animes = data.top10Animes.week
      else if (timeframe === 'monthly') animes = data.top10Animes.month
      else animes = data.mostPopularAnimes

      return animes.map((anime: any) => ({
        _id: anime.id,
        id: anime.id,
        name: anime.name,
        thumbnail: anime.poster,
      }))
    } catch (error) {
      logger.error({ err: error }, 'HiAnime getPopular failed')
      return []
    }
  }

  async getSchedule(): Promise<Show[]> {
    return []
  }

  async getSeasonal(page: number): Promise<Show[]> {
    try {
      const scraper = await this.getScraper()
      const data = await scraper.getCategoryAnime('currently-airing', page)

      return (data.animes || []).map((anime: any) => ({
        _id: anime.id,
        id: anime.id,
        name: anime.name,
        thumbnail: anime.poster,
      }))
    } catch (error) {
      logger.error({ err: error }, 'HiAnime getSeasonal failed')
      return []
    }
  }

  async getLatestReleases(): Promise<Show[]> {
    try {
      const scraper = await this.getScraper()
      const data = await scraper.getHomePage()

      return (data.latestEpisodeAnimes || []).map((anime: any) => ({
        _id: anime.id,
        id: anime.id,
        name: anime.name,
        thumbnail: anime.poster,
      }))
    } catch (error) {
      logger.error({ err: error }, 'HiAnime getLatestReleases failed')
      return []
    }
  }

  async getShowMeta(showId: string): Promise<Partial<Show> | null> {
    try {
      const scraper = await this.getScraper()
      const data = await scraper.getInfo(showId)

      return {
        _id: data.anime.info.id,
        id: data.anime.info.id,
        name: data.anime.info.name,
        description: data.anime.info.description,
        thumbnail: data.anime.info.poster,
        type: data.anime.info.stats.type,
        rating: data.anime.info.stats.rating,
      }
    } catch (error) {
      logger.error({ err: error, showId }, 'HiAnime getShowMeta failed')
      return null
    }
  }

  async getEpisodes(showId: string): Promise<EpisodeDetails | null> {
    try {
      const scraper = await this.getScraper()
      const data = await scraper.getEpisodes(showId)

      return {
        episodes: data.episodes.map((ep: any) => ep.number.toString()),
        description: '',
      }
    } catch (error) {
      logger.error({ err: error, showId }, 'HiAnime getEpisodes failed')
      return null
    }
  }

  async getStreamUrls(
    showId: string,
    episodeNumber: string,
    mode: 'sub' | 'dub'
  ): Promise<VideoSource[] | null> {
    try {
      const scraper = await this.getScraper()

      const epData = await scraper.getEpisodes(showId)
      const episode = epData.episodes.find((ep: any) => ep.number.toString() === episodeNumber)

      if (!episode) {
        logger.warn({ showId, episodeNumber }, 'Episode not found')
        return null
      }

      const servers = await scraper.getEpisodeServers(episode.episodeId)
      const sourceList = mode === 'dub' ? servers.dub : servers.sub

      const videoSources: VideoSource[] = []

      for (const s of sourceList) {
        try {
          const sources = await scraper.getEpisodeSources(episode.episodeId, s.serverName, mode)

          if (sources?.sources?.length) {
            videoSources.push({
              sourceName: s.serverName,
              links: sources.sources.map((src: any) => ({
                resolutionStr: src.quality || 'auto',
                link: src.url,
                hls: src.isM3U8 || String(src.url).includes('.m3u8'),
                headers: sources.headers,
              })),
              subtitles: (sources.subtitles || []).map((sub: any) => ({
                src: sub.url,
                lang: sub.lang,
                label: sub.lang,
              })),
              type: 'player',
            })
          }
        } catch (err: any) {
          logger.warn({ err: err.message, server: s.serverName }, 'Failed server source')
        }
      }

      return videoSources
    } catch (error: any) {
      logger.error({ err: error.message, showId, episodeNumber }, 'HiAnime getStreamUrls failed')
      return null
    }
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
