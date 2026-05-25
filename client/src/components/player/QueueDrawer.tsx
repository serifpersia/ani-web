import React from 'react'
import { Link } from 'react-router-dom'
import { FaBars, FaListUl, FaTimes } from 'react-icons/fa'
import {
  useClearQueue,
  useQueue,
  useRemoveFromQueue,
  useReorderQueue,
} from '../../hooks/useAnimeData'
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
  onDragStart: (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDragEnd: (e: React.DragEvent) => void
  isDragging: boolean
}

const QueueItem = ({
  item,
  isActive,
  onRemove,
  onDragStart,
  onDragEnter,
  onDragEnd,
  isDragging,
}: QueueItemProps) => {
  const { titlePreference } = useTitlePreference()

  const displayTitle =
    (item[titlePreference as keyof QueueItem] as string) || item.name || 'Unknown show'

  return (
    <div
      className={`${styles.item} ${isActive ? styles.active : ''} ${isDragging ? styles.dragging : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
    >
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
  const { data: queueData = [] } = useQueue()
  const [localQueue, setLocalQueue] = React.useState<QueueItem[]>([])
  const [draggedIndex, setDraggedIndex] = React.useState<number | null>(null)

  const removeQueue = useRemoveFromQueue()
  const clearQueue = useClearQueue()
  const reorderQueue = useReorderQueue()

  React.useEffect(() => {
    setLocalQueue(queueData)
  }, [queueData])

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

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragEnter = (index: number) => {
    if (draggedIndex === null || draggedIndex === index) return

    const newQueue = [...localQueue]
    const draggedItem = newQueue[draggedIndex]
    newQueue.splice(draggedIndex, 1)
    newQueue.splice(index, 0, draggedItem)
    setDraggedIndex(index)
    setLocalQueue(newQueue)
  }

  const handleDragEnd = () => {
    if (draggedIndex !== null) {
      // Reorder API call
      reorderQueue.mutate(
        localQueue.map((item) => ({
          id: item.id,
          showId: item.showId,
          episodeNumber: item.episodeNumber,
        }))
      )
    }
    setDraggedIndex(null)
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
            {localQueue.length > 0 && (
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

        {localQueue.length === 0 ? (
          <div className={styles.empty}>Your queue is empty.</div>
        ) : (
          <div className={styles.list}>
            {localQueue.map((item, index) => (
              <QueueItem
                key={item.id}
                item={item}
                isActive={item.showId === currentShowId && item.episodeNumber === currentEpisode}
                onRemove={handleRemove}
                onDragStart={() => handleDragStart(index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDragEnd}
                isDragging={draggedIndex === index}
              />
            ))}
          </div>
        )}
      </aside>
    </>
  )
}

export default QueueDrawer
