import React, { memo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { FaMicrophone, FaClosedCaptioning, FaTimes } from 'react-icons/fa'

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

interface AnimeCardConfig {
  elements?: {
    poster?: {
      typeBadge?: boolean
      episodeBadge?: boolean
      removeButton?: boolean
      adultBadge?: boolean
    }
    info?: {
      title?: boolean
      mobileBadges?: boolean
      progress?: boolean
      meta?: boolean
    }
  }
}

const defaultConfig: AnimeCardConfig = {
  elements: {
    poster: {
      typeBadge: true,
      episodeBadge: true,
      adultBadge: true,
    },
    info: {
      title: true,
      mobileBadges: true,
      progress: true,
      meta: true,
    },
  },
}

interface AnimeCardProps {
  anime: Anime
  continueWatching?: boolean
  onRemove?: (id: string) => void
  isLCP?: boolean
  config?: AnimeCardConfig
  layout?: 'vertical' | 'horizontal'
}

const AnimeCard: React.FC<AnimeCardProps> = memo(
  ({ anime, continueWatching = false, onRemove, isLCP = false, config, layout = 'vertical' }) => {
    const isMobile = useIsMobile()
    const { titlePreference } = useTitlePreference()
    const [isLoaded, setIsLoaded] = useState(false)

    const mergedConfig = {
      ...defaultConfig,
      ...config,
      elements: {
        ...defaultConfig.elements,
        ...(config?.elements || {}),
        poster: {
          ...defaultConfig.elements?.poster,
          ...(config?.elements?.poster || {}),
        },
        info: {
          ...defaultConfig.elements?.info,
          ...(config?.elements?.info || {}),
        },
      },
    }

    const hasNewEpisodes = (anime.newEpisodesCount || 0) > 0
    const hasProgress = (anime.currentTime || 0) > 0 && (anime.duration || 0) > 0

    const displayTitle = anime[titlePreference] || anime.name

    const progressRatio = (anime.currentTime || 0) / (anime.duration || 1)

    const episodeToPlay = anime.episodeNumber ?? anime.nextEpisodeToWatch

    const linkTarget = continueWatching
      ? episodeToPlay
        ? `/watch/${anime._id}/${episodeToPlay}`
        : `/watch/${anime._id}`
      : episodeToPlay && anime.episodeNumber
        ? `/watch/${anime._id}/${anime.episodeNumber}`
        : hasProgress
          ? `/watch/${anime._id}/${anime.episodeNumber}`
          : `/anime/${anime._id}`

    const progressPercent = hasProgress
      ? ((anime.currentTime || 0) / (anime.duration || 1)) * 100
      : 0

    const handleRemoveClick = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const id = anime.id || anime.showId || anime._id
        if (onRemove) onRemove(id)
      },
      [onRemove, anime.id, anime.showId, anime._id]
    )

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

    const posterEls = mergedConfig.elements?.poster
    const infoEls = mergedConfig.elements?.info
    const showTypeBadge = posterEls?.typeBadge ?? (continueWatching ? false : true)
    const showEpBadge = posterEls?.episodeBadge ?? true
    const showRemoveBtn =
      posterEls?.removeButton === undefined
        ? continueWatching && !!onRemove
        : posterEls.removeButton
    const showAdultBadge = posterEls?.adultBadge ?? true
    const showMobileBadges = infoEls?.mobileBadges ?? true
    const showProgress = infoEls?.progress ?? true
    const showMeta = infoEls?.meta ?? true

    const adultContent =
      anime.isAdult ||
      anime.rating === 'R+' ||
      anime.rating === 'Rx' ||
      anime.rating?.includes('17+')

    return (
      <div className={styles.cardWrapper}>
        <Link to={linkTarget} className={`${styles.card} ${styles[layout]}`}>
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
                {showTypeBadge && <div className={styles.typeBadge}>{anime.type || 'TV'}</div>}

                {showEpBadge && progressString && (
                  <div className={styles.epBadge}>{progressString}</div>
                )}
              </>
            )}

            {showAdultBadge && adultContent && <div className={styles.adultBadge}>18+</div>}
          </div>

          <div className={styles.info}>
            {infoEls?.title !== false && (
              <div className={styles.title} title={displayTitle}>
                {displayTitle}
              </div>
            )}

            {isMobile && showMobileBadges && (
              <div className={styles.mobileBadges}>
                <span className={styles.mobileType}>{anime.type || 'TV'}</span>
                {progressString && <span className={styles.mobileEp}>{progressString}</span>}
              </div>
            )}

            {showProgress && continueWatching && hasProgress && (
              <div>
                <div className={styles.progressContainer}>
                  <div className={styles.progressBar} style={{ width: `${progressPercent}%` }} />
                </div>
                <div className={styles.timestamp}>
                  {formatTime(anime.currentTime || 0)} / {formatTime(anime.duration || 0)}
                </div>
              </div>
            )}

            {showMeta && (
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
            )}
          </div>
        </Link>
        {showRemoveBtn && (
          <button className={styles.removeBtn} onClick={handleRemoveClick} aria-label="Remove">
            <FaTimes size={10} />
          </button>
        )}
      </div>
    )
  }
)

export default AnimeCard
