import { Router } from 'express'
import { WatchlistController } from '../controllers/watchlist.controller'
import { AllAnimeProvider } from '../providers/allanime.provider'
import { AnimePaheProvider } from '../providers/animepahe.provider'
import { discordRPCService } from '../discord-rpc'
import { DatabaseWrapper } from '../db'

export function createWatchlistRouter(
  allAnime: AllAnimeProvider,
  animePahe: AnimePaheProvider,
  getDb: () => DatabaseWrapper
): Router {
  const router = Router()
  const controller = new WatchlistController({ allAnime, animePahe })

  controller.startNotificationDiscovery(getDb)

  router.get('/continue-watching/all', controller.getAllContinueWatching)
  router.get('/continue-watching/this-week', controller.getThisWeekSchedule)
  router.post('/continue-watching/remove', controller.removeContinueWatching)
  router.post('/update-progress', controller.updateProgress)
  router.get('/watchlist', controller.getWatchlist)
  router.get('/watchlist/check/:showId', controller.checkWatchlist)
  router.post('/watchlist/add', controller.addToWatchlist)
  router.post('/watchlist/remove', controller.removeFromWatchlist)
  router.post('/watchlist/status', controller.updateWatchlistStatus)
  router.get('/queue', controller.getQueue)
  router.get('/queue/suggested/:showId', controller.getSuggestedQueueEpisode)
  router.post('/queue/add', controller.addToQueue)
  router.post('/queue/remove', controller.removeFromQueue)
  router.post('/queue/clear', controller.clearQueue)
  router.post('/queue/reorder', controller.reorderQueue)
  router.get('/episode-progress/:showId/:episodeNumber', controller.getEpisodeProgress)
  router.get('/watched-episodes/:showId', controller.getWatchedEpisodes)
  router.get('/notifications', controller.getNotifications)
  router.post('/notifications/dismiss', controller.dismissNotification)
  router.post('/notifications/clear-all', controller.clearAllNotifications)

  router.post('/discord/clear', (req, res) => {
    const { sessionId } = req.body
    if (!discordRPCService.isServiceEnabled) {
      return res.json({ success: true })
    }
    discordRPCService.clearPresence(sessionId)
    res.json({ success: true })
  })

  router.post('/discord/status', (req, res) => {
    const { page } = req.body
    if (typeof page !== 'string' || !discordRPCService.isServiceEnabled) {
      return res.json({ success: true })
    }
    discordRPCService.setIdleStatus(page)
    res.json({ success: true })
  })

  return router
}
