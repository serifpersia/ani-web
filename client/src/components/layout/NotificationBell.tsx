import React, { useState, useEffect, useRef } from 'react'
import { FaBell } from 'react-icons/fa'
import NotificationDropdown from './NotificationDropdown'
import { useNotifications } from '../../hooks/useAnimeData'
import styles from './Notification.module.css'

const NotificationBell: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  const { data: notifications = [] } = useNotifications()
  const count = notifications.length

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const displayCount = count > 5 ? '5+' : count

  return (
    <div className={styles.container} ref={bellRef}>
      <button
        className={styles.bellBtn}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
      >
        <FaBell />
        {count > 0 && <span className={styles.badge}>{displayCount}</span>}
      </button>

      {isOpen && <NotificationDropdown />}
    </div>
  )
}

export default NotificationBell
