import { Router } from 'express';
import { DataController } from '../controllers/data.controller';
import { AllAnimeProvider } from '../providers/allanime.provider';
import NodeCache from 'node-cache';

export function createDataRouter(apiCache: NodeCache, provider: AllAnimeProvider): Router {
    const router = Router();
    const controller = new DataController(provider);

    // Cached routes
    router.get('/popular/:timeframe', (req, res, next) => {
        const cacheKey = `popular-${(req.params.timeframe as string).toLowerCase()}`;
        const cached = apiCache.get(cacheKey);
        if (cached) return res.json(cached);

        const originalJson = res.json.bind(res);
        res.json = (data: any) => {
            apiCache.set(cacheKey, data);
            return originalJson(data);
        };
        next();
    }, controller.getPopular);

    router.get('/schedule/:date', (req, res, next) => {
        const cacheKey = `schedule-${req.params.date}`;
        const cached = apiCache.get(cacheKey);
        if (cached) return res.json(cached);

        const originalJson = res.json.bind(res);
        res.json = (data: any) => {
            apiCache.set(cacheKey, data);
            return originalJson(data);
        };
        next();
    }, controller.getSchedule);

    // Non-cached routes
    router.get('/skip-times/:showId/:episodeNumber', controller.getSkipTimes);
    router.get('/video', controller.getVideo);
    router.get('/episodes', controller.getEpisodes);
    router.get('/search', controller.search);
    router.get('/seasonal', controller.getSeasonal);
    router.get('/latest-releases', controller.getLatestReleases);
    router.get('/show-meta/:id', controller.getShowMeta);
    router.get('/show-details/:id', controller.getShowDetails);
    router.get('/allmanga-details/:id', controller.getAllmangaDetails);
    router.get('/genres-and-tags', controller.getGenresAndTags);

    return router;
}
