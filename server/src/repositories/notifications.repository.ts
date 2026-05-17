import { DatabaseWrapper } from '../db'
import { dbAll, dbRun } from '../utils/db-utils'

export const NotificationsRepository = {
  getDismissedByShow: (db: DatabaseWrapper, showId: string) =>
    dbAll<{ episodeNumber: string }>(
      db,
      'SELECT episodeNumber FROM dismissed_notifications WHERE showId = ?',
      [showId]
    ),

  getDiscoveredByShow: (db: DatabaseWrapper, showId: string) =>
    dbAll<{ episodeNumber: string }>(
      db,
      'SELECT episodeNumber FROM discovered_notifications WHERE showId = ?',
      [showId]
    ),

  addDiscovered: (db: DatabaseWrapper, showId: string, episodeNumber: string) =>
    dbRun(
      db,
      'INSERT OR IGNORE INTO discovered_notifications (showId, episodeNumber) VALUES (?, ?)',
      [showId, episodeNumber]
    ),

  addDismissed: (db: DatabaseWrapper, showId: string, episodeNumber: string) =>
    dbRun(
      db,
      'INSERT OR IGNORE INTO dismissed_notifications (showId, episodeNumber) VALUES (?, ?)',
      [showId, episodeNumber]
    ),

  dismissFromDiscovered: (db: DatabaseWrapper, showId?: string) => {
    if (showId) {
      return dbRun(
        db,
        'INSERT OR IGNORE INTO dismissed_notifications (showId, episodeNumber) SELECT showId, episodeNumber FROM discovered_notifications WHERE showId = ?',
        [showId]
      )
    } else {
      return dbRun(
        db,
        'INSERT OR IGNORE INTO dismissed_notifications (showId, episodeNumber) SELECT showId, episodeNumber FROM discovered_notifications'
      )
    }
  },

  deleteByShow: (db: DatabaseWrapper, showId: string) =>
    Promise.all([
      dbRun(db, 'DELETE FROM dismissed_notifications WHERE showId = ?', [showId]),
      dbRun(db, 'DELETE FROM discovered_notifications WHERE showId = ?', [showId]),
    ]),

  deleteSpecificDismissed: (db: DatabaseWrapper, showId: string, episodeNumber: string) =>
    dbRun(db, 'DELETE FROM dismissed_notifications WHERE showId = ? AND episodeNumber = ?', [
      showId,
      episodeNumber,
    ]),

  cleanupWatchedNotifications: (db: DatabaseWrapper) =>
    Promise.all([
      dbRun(
        db,
        'DELETE FROM dismissed_notifications WHERE EXISTS (SELECT 1 FROM watched_episodes we WHERE we.showId = dismissed_notifications.showId AND we.episodeNumber = dismissed_notifications.episodeNumber)'
      ),
      dbRun(
        db,
        'DELETE FROM discovered_notifications WHERE EXISTS (SELECT 1 FROM watched_episodes we WHERE we.showId = discovered_notifications.showId AND we.episodeNumber = discovered_notifications.episodeNumber)'
      ),
    ]),
}
