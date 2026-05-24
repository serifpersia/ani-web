import React from 'react'
import { Link } from 'react-router-dom'
import { FaBars, FaListUl, FaTimes } from 'react-icons/fa'
import { useClearQueue, useQueue, useRemoveFromQueue } from '../../hooks/useAnimeData'
import type { QueueItem } from '../../hooks/useAnimeData'
import { fixThumbnailUrl } from '../../lib/utils'
import { useTitlePreference } from '../../contexts/TitlePreferenceContext'
import styles from './QueueDrawer.module.css'

interface QueueDrawerProps {
  isOpen: boolean
  onClose: () => void
  currentShowId?: string
  currentEpisode?: string
}

interface QueueItemProps {
  item: QueueItem
  isActive: boolean
  onRemove: (item: QueueItem) => void
}

const QueueItem = ({ item, isActive, onRemove }: QueueItemProps) => {
  const { titlePreference } = useTitlePreference()

  const displayTitle =
    (item[titlePreference as keyof QueueItem] as string) || item.name || 'Unknown show'

  return (
    <div className={`${styles.item} ${isActive ? styles.active : ''}`}>
      <div className={styles.dragHandle}>
        <FaBars />
      </div>
      <img
        className={styles.thumbnail}
        src={fixThumbnailUrl(item.thumbnail || '', 64, 86)}
        alt={displayTitle}
        onError={(event) => {
          event.currentTarget.src = '/placeholder.svg'
        }}
      />
      <div className={styles.meta}>
        <Link className={styles.name} to={`/watch/${item.showId}/${item.episodeNumber}`}>
          {displayTitle}
        </Link>
        <div className={styles.episode}>Episode {item.episodeNumber}</div>
      </div>
      <button
        className={styles.iconBtn}
        type="button"
        onClick={() => onRemove(item)}
        aria-label={`Remove ${displayTitle} episode ${item.episodeNumber} from queue`}
      >
        <FaTimes />
      </button>
    </div>
  )
}

const QueueDrawer = ({ isOpen, onClose, currentShowId, currentEpisode }: QueueDrawerProps) => {
  const { data: queue = [] } = useQueue()
  const removeQueue = useRemoveFromQueue()
  const clearQueue = useClearQueue()

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleRemove = (item: QueueItem) => {
    removeQueue.mutate({ showId: item.showId, episodeNumber: item.episodeNumber })
  }

  return (
    <>
      {isOpen && <div className={styles.overlay} onClick={onClose} />}
      <aside className={`${styles.drawer} ${isOpen ? styles.open : ''}`} aria-hidden={!isOpen}>
        <div className={styles.header}>
          <div className={styles.title}>
            <FaListUl />
            Queue
          </div>
          <div className={styles.actions}>
            {queue.length > 0 && (
              <button className={styles.clearBtn} type="button" onClick={() => clearQueue.mutate()}>
                Clear All
              </button>
            )}
            <button
              className={styles.iconBtn}
              type="button"
              onClick={onClose}
              aria-label="Close queue"
            >
              <FaTimes />
            </button>
          </div>
        </div>

        {queue.length === 0 ? (
          <div className={styles.empty}>Your queue is empty.</div>
        ) : (
          <div className={styles.list}>
            {queue.map((item) => (
              <QueueItem
                key={item.id}
                item={item}
                isActive={item.showId === currentShowId && item.episodeNumber === currentEpisode}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </aside>
    </>
  )
}

export default QueueDrawer
