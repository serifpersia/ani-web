import React, { memo, useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { FaMicrophone, FaClosedCaptioning, FaTimes } from 'react-icons/fa'

import AnimeInfoPopup from './AnimeInfoPopup'
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
  watchedCount?: number
  episodeCount?: number
  availableEpisodesDetail?: {
    sub?: string[]
    dub?: string[]
  }
  isAdult?: boolean
  rating?: string
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
    const [showPopup, setShowPopup] = useState(false)
    const [popupPosition, setPopupPosition] = useState<'left' | 'right'>('right')

    const cardRef = useRef<HTMLDivElement>(null)
    const hoverTimeout = useRef<NodeJS.Timeout | null>(null)

    const hasNewEpisodes = (anime.newEpisodesCount || 0) > 0
    const hasProgress = (anime.currentTime || 0) > 0 && (anime.duration || 0) > 0

    const displayTitle = anime[titlePreference] || anime.name

    const progressRatio = (anime.currentTime || 0) / (anime.duration || 1)

    const episodeToPlay = anime.episodeNumber ?? anime.nextEpisodeToWatch

    const linkTarget = continueWatching
      ? episodeToPlay
        ? `/watch/${anime._id}/${episodeToPlay}`
        : `/watch/${anime._id}`
      : progressRatio > 0.9 && hasNewEpisodes
        ? `/watch/${anime._id}/${anime.nextEpisodeToWatch}`
        : hasProgress
          ? `/watch/${anime._id}/${anime.episodeNumber}`
          : `/watch/${anime._id}`

    const progressPercent = hasProgress
      ? ((anime.currentTime || 0) / (anime.duration || 1)) * 100
      : 0

    const handleRemoveClick = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (onRemove) onRemove(anime.id)
      },
      [onRemove, anime.id]
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

    const displayEpisodeCount = (() => {
      const epCount = anime.episodeCount ?? 0
      const watched = anime.watchedCount ?? 0
      if (epCount && epCount >= watched) return epCount
      if (watched > 0) return watched
      return epCount || undefined
    })()

    const progressString =
      anime.watchedCount !== undefined && (displayEpisodeCount || anime.watchedCount)
        ? `EP ${anime.watchedCount} / ${displayEpisodeCount ?? anime.watchedCount}`
        : continueWatching && episodeToPlay
          ? `EP ${episodeToPlay}`
          : null

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

                {progressString && <div className={styles.epBadge}>{progressString}</div>}
              </>
            )}

            {continueWatching && (
              <button className={styles.removeBtn} onClick={handleRemoveClick} aria-label="Remove">
                <FaTimes size={10} />
              </button>
            )}

            {(anime.isAdult ||
              anime.rating === 'R+' ||
              anime.rating === 'Rx' ||
              anime.rating?.includes('17+')) && <div className={styles.adultBadge}>18+</div>}
          </div>

          <div className={styles.info}>
            <div className={styles.title} title={displayTitle}>
              {displayTitle}
            </div>

            {isMobile && (
              <div className={styles.mobileBadges}>
                <span className={styles.mobileType}>{anime.type || 'TV'}</span>
                {progressString && <span className={styles.mobileEp}>{progressString}</span>}
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
      </div>
    )
  }
)

export default AnimeCard
