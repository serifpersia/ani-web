import React from 'react'
import NotificationItem from './NotificationItem'
import { useNotifications, useClearAllNotifications } from '../../hooks/useAnimeData'
import styles from './Notification.module.css'

const NotificationDropdown: React.FC = () => {
  const { data: notifications = [], isLoading } = useNotifications()
  const clearAllMutation = useClearAllNotifications()

  const handleClearAll = () => {
    clearAllMutation.mutate(undefined)
  }

  return (
    <div className={styles.dropdown}>
      <div className={styles.dropdownHeader}>
        <h4>Notifications</h4>
        {notifications.length > 0 && (
          <button className={styles.clearAllBtn} onClick={handleClearAll}>
            Clear All
          </button>
        )}
      </div>
      <div className={styles.list}>
        {isLoading ? (
          <div className={styles.emptyState}>Loading...</div>
        ) : notifications.length > 0 ? (
          notifications.map((notification) => (
            <NotificationItem key={notification.id} notification={notification} />
          ))
        ) : (
          <div className={styles.emptyState}>No new notifications</div>
        )}
      </div>
    </div>
  )
}

export default NotificationDropdown
