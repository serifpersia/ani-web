import React, { useEffect } from 'react'
import {
  FaSpinner,
  FaSyncAlt,
  FaCheckCircle,
  FaInfoCircle,
  FaExclamationCircle,
} from 'react-icons/fa'
import NotificationItem from './NotificationItem'
import {
  useNotifications,
  useDiscoveryStatus,
  useClearAllNotifications,
} from '../../hooks/useAnimeData'
import { useQueryClient } from '@tanstack/react-query'
import styles from './Notification.module.css'

const NotificationDropdown: React.FC = () => {
  const { data: notifications = [], isLoading } = useNotifications()
  const { data: status } = useDiscoveryStatus()
  const clearAllMutation = useClearAllNotifications()
  const queryClient = useQueryClient()

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }, [queryClient])

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
      <div className={styles.discoveryStatusRow}>
        {status?.running ? (
          <>
            <FaSpinner className={styles.spinIcon} />
            <span>
              {status.total > 0
                ? `Checking ${Math.min(status.done, status.total)}/${status.total} shows...`
                : 'Checking for new episodes...'}
            </span>
          </>
        ) : status?.state === 'complete' ? (
          <>
            <FaCheckCircle size={12} />
            <span>
              Discovery complete — checked {status.total} {status.total === 1 ? 'show' : 'shows'}
            </span>
          </>
        ) : status?.state === 'empty' ? (
          <>
            <FaInfoCircle size={12} />
            <span>No shows set to Watching — nothing to check</span>
          </>
        ) : status?.state === 'error' ? (
          <>
            <FaExclamationCircle size={12} />
            <span>Last check failed — will retry automatically</span>
          </>
        ) : (
          <>
            <FaSyncAlt size={11} />
            <span>
              {status?.lastRunAt
                ? `Last checked ${Math.max(
                    1,
                    Math.round((Date.now() - status.lastRunAt) / 1000)
                  )}s ago`
                : 'Auto-checks every few minutes'}
            </span>
          </>
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
