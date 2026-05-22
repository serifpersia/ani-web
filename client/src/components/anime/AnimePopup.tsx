import React, { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { FaStar, FaPlay, FaCalendarAlt, FaTv, FaPlus, FaCheck } from 'react-icons/fa'
import { Link } from 'react-router-dom'
import { useAnimeInfoData } from '../../hooks/useAnimeInfoData'
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
              <div className={styles.title}>{showMeta.name}</div>
              {showMeta.names?.english && (
                <div className={styles.altTitle}>{showMeta.names.english}</div>
              )}
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
                <Link to={`/watch/${showId}`} className={styles.watchBtn}>
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
