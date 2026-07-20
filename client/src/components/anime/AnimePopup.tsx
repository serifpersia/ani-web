import React, { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { FaStar, FaPlay, FaTv, FaPlus, FaCheck } from 'react-icons/fa'
import { Link } from 'react-router-dom'
import { useAnimeInfoData } from '../../hooks/useAnimeInfoData'
import { useQueue, useAddToQueue, useRemoveFromQueue } from '../../hooks/useAnimeData'
import { useTitlePreference } from '../../contexts/TitlePreferenceContext'
import { getSuggestedEpisode } from '../../lib/queue'
import styles from './AnimePopup.module.css'

interface AnimePopupProps {
  showId: string
  anchorRect: DOMRect
  onMouseEnter: () => void
  onMouseLeave: () => void
}

const AnimePopup: React.FC<AnimePopupProps> = ({
  showId,
  anchorRect,
  onMouseEnter,
  onMouseLeave,
}) => {
  const { showMeta, loadingMeta, inWatchlist, toggleWatchlist } = useAnimeInfoData(showId)
  const { data: queue = [] } = useQueue()
  const addQueue = useAddToQueue()
  const removeQueue = useRemoveFromQueue()
  const [queueConfirmed, setQueueConfirmed] = useState(false)
  const { titlePreference } = useTitlePreference()

  const suggestedEpisode = useMemo(() => null, []) // Simplified for now as we don't have suggested episode hook easily available here

  const queuedItem = useMemo(() => {
    return queue.find((item) => item.showId === showId)
  }, [queue, showId])

  const handleQueueToggle = async () => {
    if (!showMeta) return
    if (queuedItem) {
      removeQueue.mutate({ showId, episodeNumber: queuedItem.episodeNumber })
      return
    }

    const suggestion = await getSuggestedEpisode(showId)
    setQueueConfirmed(true)
    addQueue.mutate({
      showId,
      episodeNumber: suggestion.episodeNumber,
      showName: showMeta.name || showMeta.names?.romaji,
      showThumbnail: showMeta.thumbnail,
      nativeName: showMeta.names?.native,
      englishName: showMeta.names?.english,
      type: showMeta.type,
    })
    window.setTimeout(() => setQueueConfirmed(false), 1000)
  }

  const displayTitle = useMemo(() => {
    if (!showMeta?.name) return ''
    if (titlePreference === 'name') return showMeta.name
    if (titlePreference === 'nativeName') return showMeta.names?.native || showMeta.name
    if (titlePreference === 'englishName') return showMeta.names?.english || showMeta.name
    return showMeta.name
  }, [showMeta, titlePreference])

  const position = useMemo(() => {
    const popupWidth = 320

    const padding = 20
    const screenWidth = window.innerWidth

    let left = anchorRect.right + 10
    let top = anchorRect.top

    // If it overflows on the right, show it on the left
    if (left + popupWidth > screenWidth - padding) {
      left = anchorRect.left - popupWidth - 10
    }

    // Vertical adjustment if it goes off bottom
    const popupHeight = 400 // Estimate
    if (top + popupHeight > window.innerHeight - padding) {
      top = window.innerHeight - popupHeight - padding
    }

    if (top < padding) top = padding

    return { left, top }
  }, [anchorRect])

  const content = (
    <div
      className={styles.popupPortal}
      style={{ left: position.left, top: position.top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className={styles.popupContent}>
        {loadingMeta ? (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <span>Fetching details...</span>
          </div>
        ) : showMeta ? (
          <>
            <div className={styles.header}>
              <div className={styles.title}>{displayTitle}</div>
            </div>

            <div className={styles.body}>
              <div className={styles.metaRow}>
                {showMeta.score && (
                  <div className={styles.metaItem}>
                    <FaStar className={styles.scoreIcon} size={14} />
                    <span>{showMeta.score}</span>
                  </div>
                )}
                {showMeta.status && (
                  <div className={styles.metaItem}>
                    <FaTv size={14} />
                    <span>{showMeta.status}</span>
                  </div>
                )}
              </div>

              <div className={styles.synopsis}>
                {showMeta.description
                  ? showMeta.description.replace(/<[^>]*>?/gm, '')
                  : 'No synopsis available.'}
              </div>

              <div className={styles.details}>
                {showMeta.nextEpisodeAirDate && (
                  <div className={styles.detailItem}>
                    <strong>Aired:</strong> {showMeta.nextEpisodeAirDate}
                  </div>
                )}
                {showMeta.genres && showMeta.genres.length > 0 && (
                  <div className={styles.genres}>
                    {showMeta.genres.slice(0, 4).map((g) => (
                      <span key={g.name} className={styles.genre}>
                        {g.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.footer}>
              <div className={styles.primaryAction}>
                <Link
                  to={`/watch/${showId}${showMeta?.name ? `?title=${encodeURIComponent(showMeta.name)}` : ''}`}
                  className={styles.watchBtn}
                >
                  <FaPlay size={14} />
                  Watch now
                </Link>
              </div>
              <div className={styles.secondaryActions}>
                <button
                  className={`${styles.watchlistBtn} ${inWatchlist ? styles.active : ''}`}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    toggleWatchlist()
                  }}
                >
                  {inWatchlist ? <FaCheck size={12} /> : <FaPlus size={12} />}
                  <span>{inWatchlist ? 'Remove' : 'Watchlist'}</span>
                </button>
                <button
                  className={`${styles.watchlistBtn} ${queuedItem || queueConfirmed ? styles.active : ''}`}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleQueueToggle()
                  }}
                >
                  {queuedItem || queueConfirmed ? <FaCheck size={12} /> : <FaPlus size={12} />}
                  <span>{queuedItem || queueConfirmed ? 'Queued' : 'Queue'}</span>
                </button>
                <Link to={`/anime/${showId}`} className={styles.detailsBtn}>
                  Read more
                </Link>
              </div>
            </div>
          </>
        ) : (
          <div className={styles.loading}>Failed to load info.</div>
        )}
      </div>
    </div>
  )

  return createPortal(content, document.body)
}

export default AnimePopup
