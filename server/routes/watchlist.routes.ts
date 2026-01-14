import { Router } from 'express';
import { WatchlistController } from '../controllers/watchlist.controller';
import { AllAnimeProvider } from '../providers/allanime.provider';

export function createWatchlistRouter(provider: AllAnimeProvider): Router {
    const router = Router();
    const controller = new WatchlistController(provider);

    router.get('/continue-watching', controller.getContinueWatching);
    router.get('/continue-watching/all', controller.getAllContinueWatching);
    router.post('/continue-watching/remove', controller.removeContinueWatching);
    router.post('/update-progress', controller.updateProgress);
    router.get('/watchlist', controller.getWatchlist);
    router.get('/watchlist/check/:showId', controller.checkWatchlist);
    router.post('/watchlist/add', controller.addToWatchlist);
    router.post('/watchlist/remove', controller.removeFromWatchlist);
    router.post('/watchlist/status', controller.updateWatchlistStatus);
    router.get('/episode-progress/:showId/:episodeNumber', controller.getEpisodeProgress);
    router.get('/watched-episodes/:showId', controller.getWatchedEpisodes);

    return router;
}
