import { Router } from 'express'
import { DataController } from '../controllers/data.controller'
import { AllAnimeProvider } from '../providers/allanime.provider'
import NodeCache from 'node-cache'

export function createDataRouter(apiCache: NodeCache, provider: AllAnimeProvider): Router {
  const router = Router()
  const controller = new DataController(provider)

  router.get(
    '/popular/:timeframe',
    (req, res, next) => {
      const cacheKey = `popular-${(req.params.timeframe as string).toLowerCase()}`
      const cached = apiCache.get(cacheKey)
      if (cached) return res.json(cached)

      const originalJson = res.json.bind(res)
      res.json = (data: any) => {
        apiCache.set(cacheKey, data)
        return originalJson(data)
      }
      next()
    },
    controller.getPopular
  )

  router.get(
    '/schedule/:date',
    (req, res, next) => {
      const cacheKey = `schedule-${req.params.date}`
      const cached = apiCache.get(cacheKey)
      if (cached) return res.json(cached)

      const originalJson = res.json.bind(res)
      res.json = (data: any) => {
        apiCache.set(cacheKey, data)
        return originalJson(data)
      }
      next()
    },
    controller.getSchedule
  )

  router.get(
    '/latest-releases',
    (req, res, next) => {
      const cacheKey = 'latest-releases'
      const cached = apiCache.get(cacheKey)
      if (cached) return res.json(cached)

      const originalJson = res.json.bind(res)
      res.json = (data: any) => {
        apiCache.set(cacheKey, data, 300)
        return originalJson(data)
      }
      next()
    },
    controller.getLatestReleases
  )

  router.get(
    '/search',
    (req, res, next) => {
      const cacheKey = `search-${JSON.stringify(req.query)}`
      const cached = apiCache.get(cacheKey)
      if (cached) return res.json(cached)

      const originalJson = res.json.bind(res)
      res.json = (data: any) => {
        apiCache.set(cacheKey, data, 1800)
        return originalJson(data)
      }
      next()
    },
    controller.search
  )

  router.get(
    '/show-meta/:id',
    (req, res, next) => {
      const cacheKey = `meta-${req.params.id}`
      const cached = apiCache.get(cacheKey)
      if (cached) return res.json(cached)

      const originalJson = res.json.bind(res)
      res.json = (data: any) => {
        if (data) apiCache.set(cacheKey, data, 3600)
        return originalJson(data)
      }
      next()
    },
    controller.getShowMeta
  )

  router.get('/skip-times/:showId/:episodeNumber', controller.getSkipTimes)
  router.get('/video', controller.getVideo)
  router.get('/episodes', controller.getEpisodes)
  router.get('/seasonal', controller.getSeasonal)
  router.get('/show-details/:id', controller.getShowDetails)
  router.get('/allmanga-details/:id', controller.getAllmangaDetails)
  router.get('/genres-and-tags', controller.getGenresAndTags)

  return router
}
