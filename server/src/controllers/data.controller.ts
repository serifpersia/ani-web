import { Request, Response } from 'express'
import { Provider, Show } from '../providers/provider.interface'
import { genres, tags, studios } from '../constants.json'
import {
  getTrending,
  getLatestReleases,
  getSeasonal,
  getShowMetaById,
  getAnilistEpisodes,
  getSchedule,
  searchAnilist,
} from '../lib/anilist'
import { getMigratedId } from '../lib/migration'
import logger from '../logger'

export class DataController {
  constructor(private providers: { [key: string]: Provider }) {}

  private getProvider(req: Request): Provider {
    const providerName = (req.query.provider as string) || 'allanime'
    return this.providers[providerName.toLowerCase()] || this.providers['allanime']
  }

  getTrending = async (_req: Request, res: Response) => {
    try {
      const data = await getTrending(1, 20, 'TRENDING_DESC', 'RELEASING')
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (e) {
      logger.error({ err: e }, 'Trending fetch failed')
      res.json([])
    }
  }

  getPopularList = async (req: Request, res: Response) => {
    const sort =
      (req.query.sort as string) === 'POPULARITY_DESC' ? 'POPULARITY_DESC' : 'TRENDING_DESC'
    const page = parseInt(req.query.page as string) || 1
    const size = parseInt(req.query.size as string) || 20
    try {
      const data = await getTrending(page, size, sort)
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (e) {
      logger.error({ err: e }, 'Popular list fetch failed')
      res.json([])
    }
  }

  getPopular = async (req: Request, res: Response) => {
    const timeframe = (req.params.timeframe as string).toLowerCase() as
      | 'daily'
      | 'weekly'
      | 'monthly'
      | 'all'
    const page = parseInt(req.query.page as string) || 1
    const size = parseInt(req.query.size as string) || 10
    try {
      const data = await this.getProvider(req).getPopular(timeframe, page, size)
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (e) {
      if ((e as Error).message === 'AUTH_REQUIRED') {
        return res.status(403).json({ error: 'AUTH_REQUIRED', provider: 'animepahe' })
      }
      throw e
    }
  }

  getSchedule = async (req: Request, res: Response) => {
    try {
      const date = new Date(req.params.date + 'T00:00:00.000Z')
      const format = (req.query.format as string) || undefined
      const data = await getSchedule(date, format)
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (e) {
      logger.error({ err: e, date: req.params.date }, 'Schedule fetch failed')
      res.json([])
    }
  }

  getSkipTimes = async (req: Request, res: Response) => {
    try {
      const showId = req.params.showId as string
      const episodeNumber = req.params.episodeNumber as string
      if (/^\d+$/.test(showId)) {
        const skipRes = await fetch(
          `https://api.aniskip.com/v1/skip-times/${showId}/${episodeNumber}?types=op&types=ed`
        )
        if (skipRes.ok) {
          const data = await skipRes.json()
          return res.json(data)
        }
      }
      const data = await this.getProvider(req).getSkipTimes(showId, episodeNumber)
      res.json(data)
    } catch {
      res.json({ found: false, results: [] })
    }
  }

  getVideo = async (req: Request, res: Response) => {
    try {
      const urls = await this.getProvider(req).getStreamUrls(
        req.query.showId as string,
        req.query.episodeNumber as string,
        req.query.mode as 'sub' | 'dub'
      )
      res.json(urls || [])
    } catch (e) {
      if ((e as Error).message === 'AUTH_REQUIRED') {
        return res.status(403).json({ error: 'AUTH_REQUIRED', provider: 'animepahe' })
      }
      logger.error({ err: e, provider: req.query.provider }, 'Provider video fetch failed')
      res.json([])
    }
  }

  getEpisodes = async (req: Request, res: Response) => {
    const showIdRaw = req.query.showId as string

    if (!showIdRaw) {
      return res.json({ episodes: [] })
    }

    const showId = await getMigratedId(req.db, showIdRaw, this.providers)

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(showId)) {
      try {
        if (this.providers['animepahe']) {
          const data = await this.providers['animepahe'].getEpisodes(
            showId,
            req.query.mode as 'sub' | 'dub'
          )
          return res.json(data || { episodes: [] })
        }
      } catch {
        return res.json({ episodes: [] })
      }
    }

    const isNumeric = /^\d+$/.test(showId)

    if (isNumeric) {
      try {
        const episodes = await getAnilistEpisodes(showId)
        res.set('Cache-Control', 'public, max-age=3600').json({ episodes })
      } catch (e) {
        logger.error({ err: e, showId }, 'AniList episodes fetch failed')
        res.json({ episodes: [] })
      }
      return
    }

    const providerName = (req.query.provider as string) || 'allanime'
    const provider = this.providers[providerName.toLowerCase()]
    if (provider && providerName.toLowerCase() !== 'allanime') {
      try {
        const data = await provider.getEpisodes(showId, req.query.mode as 'sub' | 'dub')
        if (data?.episodes?.length) {
          return res.json(data)
        }
      } catch {
        // ignore
      }
    }

    try {
      if (this.providers['allanime']) {
        const data = await this.providers['allanime'].getEpisodes(
          showId,
          req.query.mode as 'sub' | 'dub'
        )
        if (data?.episodes?.length) {
          return res.json(data)
        }
      }
    } catch {
      // ignore
    }

    res.json({ episodes: [] })
  }

  search = async (req: Request, res: Response) => {
    try {
      const providerName = (req.query.provider as string) || 'anilist'
      if (providerName.toLowerCase() === 'anilist') {
        const query = (req.query.query as string) || ''
        const page = parseInt(req.query.page as string) || 1
        const perPage = parseInt(req.query.limit as string) || 14
        const sort = (req.query.sortBy as string) || undefined

        const result = await searchAnilist({
          query,
          page,
          perPage,
          format: req.query.type as string,
          status: req.query.status as string,
          season: req.query.season as string,
          seasonYear: req.query.year ? parseInt(req.query.year as string) : undefined,
          countryOfOrigin: req.query.country as string,
          genre: req.query.genres as string,
          genre_not_in: req.query.excludeGenres
            ? (req.query.excludeGenres as string).split(',')
            : undefined,
          tag_not_in: req.query.excludeTags
            ? (req.query.excludeTags as string).split(',')
            : undefined,
          averageScore_greater: req.query.minScore
            ? parseInt(req.query.minScore as string)
            : undefined,
          episodes_greater: req.query.minEpisodes
            ? parseInt(req.query.minEpisodes as string)
            : undefined,
          isAdult:
            req.query.adult === 'true' ? true : req.query.adult === 'false' ? false : undefined,
          sort,
        })
        return res.json(result)
      }

      const data = await this.getProvider(req).search(req.query)
      res.json(data)
    } catch (e) {
      if ((e as Error).message === 'AUTH_REQUIRED') {
        return res.status(403).json({ error: 'AUTH_REQUIRED', provider: 'animepahe' })
      }
      throw e
    }
  }

  getSeasonal = async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1
    const size = parseInt(req.query.size as string) || 14
    const format = req.query.format as string | undefined
    try {
      const data = await getSeasonal(page, size, format)
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (e) {
      logger.error({ err: e }, 'Seasonal fetch failed')
      res.json([])
    }
  }

  getLatestReleases = async (req: Request, res: Response) => {
    const format = (req.query.format as string) || 'TV'
    const page = parseInt(req.query.page as string) || 1
    const size = parseInt(req.query.size as string) || 12
    try {
      const data = await getLatestReleases(format, page, size)
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (e) {
      logger.error({ err: e }, 'Latest releases fetch failed')
      res.json([])
    }
  }

  getShowMeta = async (req: Request, res: Response) => {
    const showIdRaw = req.params.id as string
    const id = await getMigratedId(req.db, showIdRaw, this.providers)
    const providerName = (req.query.provider as string) || 'allanime'
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    const isNumeric = /^\d+$/.test(id)

    if (isUuid) {
      try {
        if (this.providers['animepahe']) {
          const meta = await this.providers['animepahe'].getShowMeta(id)
          return res.json(meta || {})
        }
      } catch (e) {
        if ((e as Error).message === 'AUTH_REQUIRED') {
          return res.status(403).json({ error: 'AUTH_REQUIRED', provider: 'animepahe' })
        }
        logger.warn({ id, error: (e as Error).message }, 'AnimePahe getShowMeta failed for UUID')
      }
      return res.json({})
    }

    if (isNumeric) {
      try {
        const meta = await getShowMetaById(id)
        res.set('Cache-Control', 'public, max-age=3600').json(meta || {})
      } catch (e) {
        logger.error({ err: e, id }, 'AniList show-meta fetch failed')
        res.json({})
      }
      return
    }

    const provider = this.providers[providerName.toLowerCase()]
    if (provider && providerName.toLowerCase() !== 'allanime') {
      try {
        const meta = await provider.getShowMeta(id)
        if (meta) {
          return res.json(meta)
        }
      } catch (e) {
        logger.warn(
          { id, provider: providerName, error: (e as Error).message },
          'Provider getShowMeta failed'
        )
      }
    }

    try {
      if (this.providers['allanime']) {
        const meta = await this.providers['allanime'].getShowMeta(id)
        if (meta) {
          return res.json(meta)
        }
      }
    } catch (e) {
      logger.warn({ id, error: (e as Error).message }, 'AllAnime getShowMeta failed')
    }

    res.json({})
  }

  getGenresAndTags = (_req: Request, res: Response) => {
    res.json({ genres, tags, studios })
  }
}
