import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FaCheck, FaChevronDown, FaPlus, FaTimes } from 'react-icons/fa'
import { useQuery } from '@tanstack/react-query'
import {
  useQueue,
  useAddToQueueBatch,
  useRemoveFromQueueBatch,
  useQueueRemainingEpisodes,
} from '../../hooks/useAnimeData'
import { getSuggestedEpisode } from '../../lib/queue'
import styles from './QueueOptionsButton.module.css'

const MENU_WIDTH = 240
const MENU_VERTICAL_GAP = 8

interface QueueOptionsButtonProps {
  showId?: string
  showName?: string
  showThumbnail?: string
  nativeName?: string
  englishName?: string
  showType?: string
  className?: string
  activeClassName?: string
  align?: 'left' | 'right'
}

const QueueOptionsButton: React.FC<QueueOptionsButtonProps> = ({
  showId,
  showName,
  showThumbnail,
  nativeName,
  englishName,
  showType,
  className = '',
  activeClassName = '',
  align = 'right',
}) => {
  const { data: queue = [] } = useQueue()
  const addBatch = useAddToQueueBatch()
  const removeBatch = useRemoveFromQueueBatch()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const queuedItems = useMemo(() => queue.filter((item) => item.showId === showId), [queue, showId])

  const { data: suggestedEpisode } = useQuery({
    queryKey: ['suggestedEpisode', showId],
    queryFn: () => getSuggestedEpisode(showId as string),
    enabled: !!showId,
  })

  const { data: remainingData, isFetching: remainingLoading } = useQueueRemainingEpisodes(
    showId,
    menuOpen
  )
  const remaining = useMemo(() => remainingData?.episodes || [], [remainingData])

  const openMenu = useCallback(() => {
    const wrapperEl = wrapperRef.current
    if (!wrapperEl) return
    const rect = wrapperEl.getBoundingClientRect()
    const viewportPadding = 8

    let left =
      align === 'left'
        ? rect.left
        : Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - viewportPadding)
    left = Math.max(viewportPadding, left)

    let top = rect.bottom + MENU_VERTICAL_GAP
    if (top + MENU_WIDTH > window.innerHeight - viewportPadding) {
      top = Math.max(viewportPadding, rect.top - MENU_WIDTH - MENU_VERTICAL_GAP)
    }

    setMenuPos({ top, left })
    setMenuOpen(true)
  }, [align])

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
    setMenuPos(null)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node
      const insideMenu = menuRef.current && menuRef.current.contains(target)
      const insideTrigger = wrapperRef.current && wrapperRef.current.contains(target)
      if (!insideMenu && !insideTrigger) {
        closeMenu()
      }
    }
    const handleScroll = () => closeMenu()
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown, { passive: true })
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', closeMenu)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', closeMenu)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen, closeMenu])

  const isQueued = queuedItems.length > 0
  const hasRemaining = remaining.length > 0

  const queueEpisodes = useCallback(
    (episodeNumbers: string[]) => {
      if (!showId || episodeNumbers.length === 0) return
      addBatch.mutate({
        showId,
        episodeNumbers,
        showName,
        showThumbnail,
        nativeName,
        englishName,
        type: showType,
      })
      closeMenu()
    },
    [showId, showName, showThumbnail, nativeName, englishName, showType, addBatch, closeMenu]
  )

  const handleRemoveAll = useCallback(() => {
    if (!showId || queuedItems.length === 0) return
    removeBatch.mutate({
      showId,
      episodeNumbers: queuedItems.map((item) => item.episodeNumber),
    })
    closeMenu()
  }, [showId, queuedItems, removeBatch, closeMenu])

  const queueOne = useCallback(() => {
    if (hasRemaining) {
      queueEpisodes([remaining[0]])
    }
  }, [hasRemaining, remaining, queueEpisodes])

  const queueThree = useCallback(() => {
    if (hasRemaining) {
      queueEpisodes(remaining.slice(0, 3))
    }
  }, [hasRemaining, remaining, queueEpisodes])

  const queueAll = useCallback(() => {
    if (hasRemaining) {
      queueEpisodes([...remaining])
    }
  }, [hasRemaining, remaining, queueEpisodes])

  const firstEpisode = remaining[0]
  const lastOfThree = remaining[Math.min(2, remaining.length - 1)]
  const suggestedId = suggestedEpisode?.episodeNumber

  const trigger = (
    <div className={styles.trigger} ref={wrapperRef}>
      <span
        className={`${styles.triggerBtn} ${className} ${isQueued ? activeClassName : ''}`}
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={isQueued ? 'Queued' : 'Queue'}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (menuOpen) {
            closeMenu()
          } else {
            openMenu()
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            if (menuOpen) {
              closeMenu()
            } else {
              openMenu()
            }
          }
        }}
      >
        {isQueued ? <FaCheck size={14} /> : <FaPlus size={14} />}
        {isQueued ? 'Queued' : 'Queue'}
        <FaChevronDown size={10} className={styles.chevron} />
      </span>
    </div>
  )

  return (
    <>
      {trigger}
      {menuOpen &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            className={styles.menu}
            style={{ top: menuPos.top, left: menuPos.left }}
            role="menu"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
          >
            <div className={styles.menuTitle}>Queue episodes</div>
            <button
              className={styles.menuItem}
              role="menuitem"
              type="button"
              disabled={!hasRemaining && !suggestedId}
              onClick={(e) => {
                e.stopPropagation()
                queueOne()
              }}
            >
              <FaPlus size={11} />
              <span>
                {hasRemaining
                  ? `+1 \u2014 EP ${firstEpisode}`
                  : `+1 \u2014 EP ${suggestedId || '?'}`}
              </span>
            </button>
            <button
              className={styles.menuItem}
              role="menuitem"
              type="button"
              disabled={!hasRemaining}
              onClick={(e) => {
                e.stopPropagation()
                queueThree()
              }}
            >
              <FaPlus size={11} />
              <span>
                {hasRemaining
                  ? `+3 \u2014 EP ${firstEpisode}${remaining.length > 1 ? `-${lastOfThree}` : ''}`
                  : '+3'}
              </span>
            </button>
            <button
              className={styles.menuItem}
              role="menuitem"
              type="button"
              disabled={!hasRemaining}
              onClick={(e) => {
                e.stopPropagation()
                queueAll()
              }}
            >
              <FaPlus size={11} />
              <span>
                All Remaining{remainingLoading ? '' : ` (${Math.max(remaining.length, 0)})`}
              </span>
            </button>
            {!remainingLoading && remaining.length === 0 && (
              <div className={styles.menuEmpty}>
                {isQueued ? 'All episodes are already queued' : 'No remaining unwatched episodes'}
              </div>
            )}
            {isQueued && (
              <button
                className={`${styles.menuItem} ${styles.removeItem}`}
                role="menuitem"
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemoveAll()
                }}
              >
                <FaTimes size={11} />
                <span>
                  Remove from Queue{queuedItems.length > 0 ? ` (${queuedItems.length})` : ''}
                </span>
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  )
}

export default QueueOptionsButton
