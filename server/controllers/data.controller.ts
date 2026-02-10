import { Request, Response } from 'express'
import { AllAnimeProvider } from '../providers/allanime.provider'
import { genres, tags, studios } from '../constants'

export class DataController {
  constructor(private provider: AllAnimeProvider) {}

  getPopular = async (req: Request, res: Response) => {
    const timeframe = (req.params.timeframe as string).toLowerCase() as
      | 'daily'
      | 'weekly'
      | 'monthly'
      | 'all'
    try {
      const data = await this.provider.getPopular(timeframe)
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (error) {
      res.status(500).send('Error')
    }
  }

  getSchedule = async (req: Request, res: Response) => {
    try {
      const data = await this.provider.getSchedule(new Date(req.params.date + 'T00:00:00.000Z'))
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (error) {
      res.status(500).send('Error')
    }
  }

  getSkipTimes = async (req: Request, res: Response) => {
    try {
      const data = await this.provider.getSkipTimes(
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
      res.json(
        await this.provider.getStreamUrls(
          req.query.showId as string,
          req.query.episodeNumber as string,
          req.query.mode as any
        )
      )
    } catch {
      res.status(500).send('Error')
    }
  }

  getEpisodes = async (req: Request, res: Response) => {
    try {
      res.json(await this.provider.getEpisodes(req.query.showId as string, req.query.mode as any))
    } catch {
      res.status(500).send('Error')
    }
  }

  search = async (req: Request, res: Response) => {
    try {
      res.json(await this.provider.search(req.query))
    } catch {
      res.status(500).send('Error')
    }
  }

  getSeasonal = async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1
      res.json(await this.provider.getSeasonal(page))
    } catch {
      res.status(500).send('Error')
    }
  }

  getLatestReleases = async (req: Request, res: Response) => {
    try {
      res.json(await this.provider.getLatestReleases())
    } catch {
      res.status(500).send('Error')
    }
  }

  getShowMeta = async (req: Request, res: Response) => {
    try {
      res.json(await this.provider.getShowMeta(req.params.id as string))
    } catch {
      res.status(500).send('Error')
    }
  }

  getShowDetails = async (req: Request, res: Response) => {
    try {
      res.json(await this.provider.getShowDetails(req.params.id as string))
    } catch {
      res.status(404).send('Not found')
    }
  }

  getAllmangaDetails = async (req: Request, res: Response) => {
    try {
      res.json(await this.provider.getAllmangaDetails(req.params.id as string))
    } catch {
      res.status(500).send('Error')
    }
  }

  getGenresAndTags = (_req: Request, res: Response) => {
    res.json({ genres, tags, studios })
  }
}
