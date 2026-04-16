import React from 'react'
import { Link } from 'react-router-dom'
import { FaTimes } from 'react-icons/fa'
import { fixThumbnailUrl } from '../../lib/utils'
import type { Notification } from '../../hooks/useAnimeData'
import { useTitlePreference } from '../../contexts/TitlePreferenceContext'
import { useDismissNotification } from '../../hooks/useAnimeData'
import styles from './Notification.module.css'

interface NotificationItemProps {
  notification: Notification
}

const NotificationItem: React.FC<NotificationItemProps> = ({ notification }) => {
  const dismissMutation = useDismissNotification()

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dismissMutation.mutate({
      showId: notification.showId,
      episodeNumber: notification.episodeNumber,
    })
  }

  const handleClick = () => {
    dismissMutation.mutate({
      showId: notification.showId,
      episodeNumber: notification.episodeNumber,
    })
  }

  const { titlePreference } = useTitlePreference()
  const displayTitle =
    titlePreference === 'nativeName'
      ? notification.nativeName || notification.name
      : titlePreference === 'englishName'
        ? notification.englishName || notification.name
        : notification.name

  return (
    <Link
      to={`/watch/${notification.showId}/${notification.episodeNumber}`}
      className={styles.item}
      onClick={handleClick}
    >
      <img
        src={fixThumbnailUrl(notification.thumbnail, 48, 64)}
        alt={notification.name}
        className={styles.thumbnail}
      />
      <div className={styles.itemInfo}>
        <span className={styles.itemTitle}>{displayTitle}</span>
        <span className={styles.itemMeta}>New Episode {notification.episodeNumber}</span>
      </div>
      <button
        className={styles.removeItem}
        onClick={handleDismiss}
        aria-label="Remove notification"
      >
        <FaTimes />
      </button>
    </Link>
  )
}

export default NotificationItem
