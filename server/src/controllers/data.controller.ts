import { Request, Response } from 'express'
import { Provider } from '../providers/provider.interface'
import { genres, tags, studios } from '../constants.json'
import logger from '../logger'
import { asyncHandler } from '../utils/async-handler'

export class DataController {
  constructor(private providers: { [key: string]: Provider }) {}

  private getProvider(req: Request): Provider {
    const providerName = (req.query.provider as string) || 'allanime'
    return this.providers[providerName.toLowerCase()] || this.providers['allanime']
  }

  getPopular = asyncHandler(async (req: Request, res: Response) => {
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
  })

  getSchedule = asyncHandler(async (req: Request, res: Response) => {
    try {
      const data = await this.getProvider(req).getSchedule(
        new Date(req.params.date + 'T00:00:00.000Z')
      )
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (e) {
      if ((e as Error).message === 'AUTH_REQUIRED') {
        return res.status(403).json({ error: 'AUTH_REQUIRED', provider: 'animepahe' })
      }
      throw e
    }
  })

  getSkipTimes = asyncHandler(async (req: Request, res: Response) => {
    try {
      const data = await this.getProvider(req).getSkipTimes(
        req.params.showId as string,
        req.params.episodeNumber as string
      )
      res.json(data)
    } catch {
      res.json({ found: false, results: [] })
    }
  })

  getVideo = asyncHandler(async (req: Request, res: Response) => {
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
      // Return empty array instead of 500 so frontend can stay functional
      // and allow provider switching.
      logger.error({ err: e, provider: req.query.provider }, 'Provider video fetch failed')
      res.json([])
    }
  })

  getEpisodes = asyncHandler(async (req: Request, res: Response) => {
    try {
      const data = await this.getProvider(req).getEpisodes(
        req.query.showId as string,
        req.query.mode as 'sub' | 'dub'
      )
      res.json(data)
    } catch (e) {
      if ((e as Error).message === 'AUTH_REQUIRED') {
        return res.status(403).json({ error: 'AUTH_REQUIRED', provider: 'animepahe' })
      }
      throw e
    }
  })

  search = asyncHandler(async (req: Request, res: Response) => {
    try {
      const data = await this.getProvider(req).search(req.query)
      res.json(data)
    } catch (e) {
      if ((e as Error).message === 'AUTH_REQUIRED') {
        return res.status(403).json({ error: 'AUTH_REQUIRED', provider: 'animepahe' })
      }
      throw e
    }
  })

  getSeasonal = asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1
    try {
      const data = await this.getProvider(req).getSeasonal(page)
      res.json(data)
    } catch (e) {
      if ((e as Error).message === 'AUTH_REQUIRED') {
        return res.status(403).json({ error: 'AUTH_REQUIRED', provider: 'animepahe' })
      }
      throw e
    }
  })

  getLatestReleases = asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1
    const size = parseInt(req.query.size as string) || 14
    try {
      const data = await this.getProvider(req).getLatestReleases(page, size)
      res.json(data)
    } catch (e) {
      if ((e as Error).message === 'AUTH_REQUIRED') {
        return res.status(403).json({ error: 'AUTH_REQUIRED', provider: 'animepahe' })
      }
      throw e
    }
  })

  getShowMeta = asyncHandler(async (req: Request, res: Response) => {
    try {
      const meta = await this.getProvider(req).getShowMeta(req.params.id as string)
      res.json(meta || {})
    } catch (e) {
      if ((e as Error).message === 'AUTH_REQUIRED') {
        return res.status(403).json({ error: 'AUTH_REQUIRED', provider: 'animepahe' })
      }
      throw e
    }
  })

  getGenresAndTags = (_req: Request, res: Response) => {
    res.json({ genres, tags, studios })
  }
}
