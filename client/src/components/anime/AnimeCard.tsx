import React, { memo, useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { FaMicrophone, FaClosedCaptioning, FaTimes } from 'react-icons/fa'

import AnimeInfoPopup from './AnimeInfoPopup'
import RemoveConfirmationModal from '../common/RemoveConfirmationModal'
import { useRemoveFromWatchlist } from '../../hooks/useAnimeData'
import { fixThumbnailUrl, formatTime } from '../../lib/utils'
import { useTitlePreference } from '../../contexts/TitlePreferenceContext'
import styles from './AnimeCard.module.css'
import useIsMobile from '../../hooks/useIsMobile'

interface Anime {
  _id: string
  id: string
  name: string
  nativeName?: string
  englishName?: string
  thumbnail: string
  type?: string
  episodeNumber?: number
  currentTime?: number
  duration?: number
  nextEpisodeToWatch?: string
  newEpisodesCount?: number
  availableEpisodesDetail?: {
    sub?: string[]
    dub?: string[]
  }
}

interface AnimeCardProps {
  anime: Anime
  continueWatching?: boolean
  onRemove?: (id: string) => void
  isLCP?: boolean
}

const AnimeCard: React.FC<AnimeCardProps> = memo(
  ({ anime, continueWatching = false, onRemove, isLCP = false }) => {
    const isMobile = useIsMobile()
    const { titlePreference } = useTitlePreference()
    const [showRemoveModal, setShowRemoveModal] = useState(false)
    const [showPopup, setShowPopup] = useState(false)
    const [popupPosition, setPopupPosition] = useState<'left' | 'right'>('right')

    const cardRef = useRef<HTMLDivElement>(null)
    const hoverTimeout = useRef<NodeJS.Timeout | null>(null)
    const removeWatchlistMutation = useRemoveFromWatchlist()

    const isUpNext = (anime.newEpisodesCount || 0) > 0
    const hasProgress = (anime.currentTime || 0) > 0 && (anime.duration || 0) > 0

    const displayTitle = anime[titlePreference] || anime.name

    const linkTarget = isUpNext
      ? `/player/${anime._id}/${anime.nextEpisodeToWatch}`
      : hasProgress || continueWatching
        ? `/player/${anime._id}/${anime.episodeNumber}`
        : `/player/${anime._id}`

    const progressPercent = hasProgress
      ? ((anime.currentTime || 0) / (anime.duration || 1)) * 100
      : 0

    const handleRemoveClick = useCallback((e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setShowRemoveModal(true)
    }, [])

    const handleConfirmRemove = useCallback(
      (options: { removeFromWatchlist?: boolean }) => {
        if (onRemove) onRemove(anime.id)
        if (options.removeFromWatchlist) removeWatchlistMutation.mutate(anime.id)
        setShowRemoveModal(false)
      },
      [onRemove, removeWatchlistMutation, anime.id]
    )

    const handleMouseEnter = () => {
      if (isMobile) return
      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect()
        setPopupPosition(rect.right > window.innerWidth - 320 ? 'left' : 'right')
      }
      hoverTimeout.current = setTimeout(() => setShowPopup(true), 400)
    }

    const handleMouseLeave = () => {
      if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
      setShowPopup(false)
    }

    const [isLoaded, setIsLoaded] = useState(false)

    return (
      <div
        ref={cardRef}
        className={styles.cardWrapper}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <Link to={linkTarget} className={styles.card}>
          <div className={styles.posterContainer}>
            <img
              src={fixThumbnailUrl(anime.thumbnail, 150, 200)}
              alt={displayTitle}
              width="150"
              height="200"
              className={`${styles.posterImg} ${isLoaded ? styles.loaded : ''}`}
              loading={isLCP ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={isLCP ? 'high' : 'auto'}
              onLoad={() => setIsLoaded(true)}
            />

            {!isMobile && (
              <>
                <div className={styles.typeBadge}>{anime.type || 'TV'}</div>

                {isUpNext && <div className={styles.newBadge}>+{anime.newEpisodesCount} NEW</div>}

                {(isUpNext || continueWatching) && (
                  <div className={styles.epBadge}>
                    {isUpNext
                      ? `Next: EP ${anime.nextEpisodeToWatch}`
                      : `EP ${anime.episodeNumber}`}
                  </div>
                )}
              </>
            )}

            {continueWatching && (
              <button className={styles.removeBtn} onClick={handleRemoveClick} aria-label="Remove">
                <FaTimes size={10} />
              </button>
            )}
          </div>

          <div className={styles.info}>
            <div className={styles.title} title={displayTitle}>
              {displayTitle}
            </div>

            {isMobile && (
              <div className={styles.mobileBadges}>
                <span className={styles.mobileType}>{anime.type || 'TV'}</span>
                {(isUpNext || continueWatching) && (
                  <span className={styles.mobileEp}>
                    {isUpNext
                      ? `Next: EP ${anime.nextEpisodeToWatch}`
                      : `EP ${anime.episodeNumber}`}
                  </span>
                )}
                {isUpNext && (
                  <span className={styles.mobileNew}>+{anime.newEpisodesCount} NEW</span>
                )}
              </div>
            )}

            {continueWatching && hasProgress && (
              <div>
                <div className={styles.progressContainer}>
                  <div className={styles.progressBar} style={{ width: `${progressPercent}%` }} />
                </div>
                <div className={styles.timestamp}>
                  {formatTime(anime.currentTime || 0)} / {formatTime(anime.duration || 0)}
                </div>
              </div>
            )}

            <div className={styles.metaRow}>
              {anime.availableEpisodesDetail?.sub && (
                <div className={styles.metaItem}>
                  <FaClosedCaptioning size={10} />
                  {anime.availableEpisodesDetail.sub.length}
                </div>
              )}
              {anime.availableEpisodesDetail?.dub && (
                <div className={styles.metaItem}>
                  <FaMicrophone size={10} />
                  {anime.availableEpisodesDetail.dub.length}
                </div>
              )}
            </div>
          </div>
        </Link>

        <AnimeInfoPopup
          animeId={anime._id}
          isVisible={showPopup && !isMobile}
          position={popupPosition}
        />

        <RemoveConfirmationModal
          isOpen={showRemoveModal}
          onClose={() => setShowRemoveModal(false)}
          onConfirm={handleConfirmRemove}
          animeName={displayTitle}
          scenario="continueWatching"
        />
      </div>
    )
  }
)

export default AnimeCard
