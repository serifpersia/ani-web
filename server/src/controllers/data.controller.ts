import { Request, Response } from 'express'
import { Provider, Show } from '../providers/provider.interface'
import { genres, tags, studios } from '../constants.json'
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
      if ((e as Error).message === 'AUTH_REQUIRED') {
        return res.status(403).json({ error: 'AUTH_REQUIRED', provider: 'animepahe' })
      }
      logger.error({ err: e, provider: req.query.provider }, 'Provider video fetch failed')
      res.json([])
    }
  }

  getEpisodes = async (req: Request, res: Response) => {
    try {
      let showId = req.query.showId as string
      const provider = this.getProvider(req)
      const providerName = ((req.query.provider as string) || 'allanime').toLowerCase()

      if (providerName === 'animepahe') {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          showId
        )
        if (!isUuid) {
          let animeName = ''
          try {
            const allAnimeProvider = this.providers['allanime']
            if (allAnimeProvider) {
              const meta = await allAnimeProvider.getShowMeta(showId)
              if (meta) {
                animeName = meta.name || meta.englishName || ''
              }
            }
          } catch (e) {
            logger.warn(
              { showId, error: (e as Error).message },
              'Failed to resolve AllAnime metadata for AnimePahe name resolution'
            )
          }

          const searchFor = animeName || showId
          const results = await provider.search({ query: searchFor })
          if (results.length > 0) {
            showId = results[0].session || results[0].id || results[0]._id
          }
        }
      }

      const data = await provider.getEpisodes(showId, req.query.mode as 'sub' | 'dub')
      res.json(data)
    } catch (e) {
      if ((e as Error).message === 'AUTH_REQUIRED') {
        return res.status(403).json({ error: 'AUTH_REQUIRED', provider: 'animepahe' })
      }
      throw e
    }
  }

  search = async (req: Request, res: Response) => {
    try {
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
    try {
      const data = await this.getProvider(req).getSeasonal(page)
      res.json(data)
    } catch (e) {
      if ((e as Error).message === 'AUTH_REQUIRED') {
        return res.status(403).json({ error: 'AUTH_REQUIRED', provider: 'animepahe' })
      }
      throw e
    }
  }

  getLatestReleases = async (req: Request, res: Response) => {
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
  }

  getShowMeta = async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string
      const providerQuery = req.query.provider as string

      if (providerQuery) {
        let meta: Partial<Show> | null = null
        const provider = this.getProvider(req)

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        if (isUuid) {
          meta = await provider.getShowMeta(id)
        } else {
          if (providerQuery.toLowerCase() === 'allanime') {
            meta = await provider.getShowMeta(id)
          } else {
            let animeName = ''
            try {
              const allAnimeProvider = this.providers['allanime']
              if (allAnimeProvider) {
                const localMeta = await allAnimeProvider.getShowMeta(id)
                if (localMeta) {
                  animeName = localMeta.name || localMeta.englishName || ''
                }
              }
            } catch (e) {
              logger.warn(
                { id, error: (e as Error).message },
                'Failed to resolve AllAnime name in getShowMeta'
              )
            }

            const searchFor = animeName || id
            const results = await provider.search({ query: searchFor })
            if (results.length > 0) {
              const targetId = results[0].session || results[0].id || results[0]._id
              meta = await provider.getShowMeta(targetId)
            }
          }
        }
        return res.json(meta || {})
      }

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      let meta: Partial<Show> | null = null

      if (isUuid) {
        try {
          if (this.providers['animepahe']) {
            meta = await this.providers['animepahe'].getShowMeta(id)
          }
        } catch (e) {
          if ((e as Error).message === 'AUTH_REQUIRED') {
            return res.status(403).json({ error: 'AUTH_REQUIRED', provider: 'animepahe' })
          }
          logger.warn({ id, error: (e as Error).message }, 'AnimePahe getShowMeta failed for UUID')
        }
      } else {
        try {
          meta = await this.providers['allanime'].getShowMeta(id)
        } catch (e) {
          logger.warn(
            { id, error: (e as Error).message },
            'AllAnime getShowMeta failed, trying fallback'
          )
        }

        if (!meta || !meta.name) {
          try {
            if (this.providers['animepahe']) {
              meta = await this.providers['animepahe'].getShowMeta(id)
            }
          } catch (e) {
            if ((e as Error).message === 'AUTH_REQUIRED') {
              return res.status(403).json({ error: 'AUTH_REQUIRED', provider: 'animepahe' })
            }
            logger.warn(
              { id, error: (e as Error).message },
              'AnimePahe fallback getShowMeta failed'
            )
          }
        }
      }

      res.json(meta || {})
    } catch (e) {
      if ((e as Error).message === 'AUTH_REQUIRED') {
        return res.status(403).json({ error: 'AUTH_REQUIRED', provider: 'animepahe' })
      }
      throw e
    }
  }

  getGenresAndTags = (_req: Request, res: Response) => {
    res.json({ genres, tags, studios })
  }
}
