import { Request, Response } from 'express'
import { Provider } from '../providers/provider.interface'
import { genres, tags, studios } from '../constants'
import logger from '../logger'

export class DataController {
  constructor(private providers: { [key: string]: Provider }) {}

  private getProvider(req: Request): Provider {
    const providerName = (req.query.provider as string) || 'allanime'
    return this.providers[providerName.toLowerCase()] || this.providers['allanime']
  }

  getPopular = async (req: Request, res: Response) => {
    const timeframe = (req.params.timeframe as string).toLowerCase() as
      | 'daily'
      | 'weekly'
      | 'monthly'
      | 'all'
    try {
      const data = await this.getProvider(req).getPopular(timeframe)
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch {
      res.status(500).send('Error')
    }
  }

  getSchedule = async (req: Request, res: Response) => {
    try {
      const data = await this.getProvider(req).getSchedule(
        new Date(req.params.date + 'T00:00:00.000Z')
      )
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch {
      res.status(500).send('Error')
    }
  }

  getSkipTimes = async (req: Request, res: Response) => {
    try {
      const data = await this.getProvider(req).getSkipTimes(
        req.params.showId as string,
        req.params.episodeNumber as string
      )
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
      // Return empty array instead of 500 so frontend can stay functional
      // and allow provider switching.
      logger.error({ err: e, provider: req.query.provider }, 'Provider video fetch failed')
      res.json([])
    }
  }

  getEpisodes = async (req: Request, res: Response) => {
    try {
      res.json(
        await this.getProvider(req).getEpisodes(
          req.query.showId as string,
          req.query.mode as 'sub' | 'dub'
        )
      )
    } catch {
      res.status(500).send('Error')
    }
  }

  search = async (req: Request, res: Response) => {
    try {
      res.json(await this.getProvider(req).search(req.query))
    } catch {
      res.status(500).send('Error')
    }
  }

  getSeasonal = async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1
      res.json(await this.getProvider(req).getSeasonal(page))
    } catch {
      res.status(500).send('Error')
    }
  }

  getLatestReleases = async (req: Request, res: Response) => {
    try {
      res.json(await this.getProvider(req).getLatestReleases())
    } catch {
      res.status(500).send('Error')
    }
  }

  getShowMeta = async (req: Request, res: Response) => {
    try {
      res.json(await this.getProvider(req).getShowMeta(req.params.id as string))
    } catch {
      res.status(500).send('Error')
    }
  }

  getShowDetails = async (req: Request, res: Response) => {
    try {
      res.json(await this.getProvider(req).getShowDetails(req.params.id as string))
    } catch {
      res.status(404).send('Not found')
    }
  }

  getAllmangaDetails = async (req: Request, res: Response) => {
    try {
      res.json(await this.getProvider(req).getAllmangaDetails(req.params.id as string))
    } catch {
      res.status(500).send('Error')
    }
  }

  getGenresAndTags = (_req: Request, res: Response) => {
    res.json({ genres, tags, studios })
  }
}
