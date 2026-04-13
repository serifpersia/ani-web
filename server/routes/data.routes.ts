import { Router, Request, Response, NextFunction } from 'express'
import { DataController } from '../controllers/data.controller'
import { AllAnimeProvider } from '../providers/allanime.provider'
import NodeCache from 'node-cache'

/** Creates a middleware that checks the cache before passing to the handler,
 *  and intercepts res.json to cache successful responses. */
function makeCacheMiddleware(
  cache: NodeCache,
  keyFn: (req: Request) => string,
  ttl?: number,
  validate: (data: unknown) => boolean = (d) => Array.isArray(d) && d.length > 0
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const cacheKey = keyFn(req)
    const cached = cache.get(cacheKey)
    if (cached) return res.json(cached)

    const originalJson = res.json.bind(res)
    res.json = (data: unknown) => {
      if (validate(data)) {
        if (ttl !== undefined) {
          cache.set(cacheKey, data, ttl)
        } else {
          cache.set(cacheKey, data)
        }
      }
      return originalJson(data)
    }
    next()
  }
}

export function createDataRouter(apiCache: NodeCache, provider: AllAnimeProvider): Router {
  const router = Router()
  const controller = new DataController(provider)

  router.get(
    '/popular/:timeframe',
    makeCacheMiddleware(
      apiCache,
      (req) => `popular-${(req.params.timeframe as string).toLowerCase()}`
    ),
    controller.getPopular
  )

  router.get(
    '/schedule/:date',
    makeCacheMiddleware(apiCache, (req) => `schedule-${req.params.date}`),
    controller.getSchedule
  )

  router.get(
    '/latest-releases',
    makeCacheMiddleware(apiCache, () => 'latest-releases', 300),
    controller.getLatestReleases
  )

  router.get(
    '/search',
    makeCacheMiddleware(apiCache, (req) => `search-${JSON.stringify(req.query)}`, 1800),
    controller.search
  )

  router.get(
    '/show-meta/:id',
    makeCacheMiddleware(
      apiCache,
      (req) => `meta-${req.params.id}`,
      3600,
      (d) => !!d
    ),
    controller.getShowMeta
  )

  router.get('/skip-times/:showId/:episodeNumber', controller.getSkipTimes)
  router.get('/video', controller.getVideo)
  router.get('/episodes', controller.getEpisodes)
  router.get(
    '/seasonal',
    makeCacheMiddleware(apiCache, (req) => `seasonal-14-${req.query.page || 1}`, 1800),
    controller.getSeasonal
  )
  router.get('/show-details/:id', controller.getShowDetails)
  router.get('/allmanga-details/:id', controller.getAllmangaDetails)
  router.get('/genres-and-tags', controller.getGenresAndTags)

  return router
}
