import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { FaPlay, FaPlus, FaCheck, FaChevronDown, FaChevronUp } from 'react-icons/fa'
import { useState } from 'react'
import { useAnimeInfoData } from '../../hooks/useAnimeInfoData'
import { fixThumbnailUrl } from '../../lib/utils'
import { useTitlePreference } from '../../contexts/TitlePreferenceContext'
import styles from './AnimeInfo.module.css'
import ErrorMessage from '../common/ErrorMessage'

const ensureHttpProtocol = (url: string): string => {
  if (!url) return url
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `https://${url}`
}

const formatNextAiring = (showMeta: {
  nextEpisodeAirDate?: string
  nextAiring?: { episode: number; timeUntilAiring: number }
}) => {
  if (showMeta.nextEpisodeAirDate) {
    return `Next episode: ${showMeta.nextEpisodeAirDate}`
  }
  if (showMeta.nextAiring?.episode) {
    const seconds = showMeta.nextAiring.timeUntilAiring
    if (seconds <= 0) return `Episode ${showMeta.nextAiring.episode}`
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (days > 0) return `Next episode: ${days}d ${hours}h`
    if (hours > 0) return `Next episode: ${hours}h ${mins}m`
    return `Next episode: ${mins}m`
  }
  return null
}

export default function AnimeInfo() {
  const { id: showId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { titlePreference } = useTitlePreference()
  const [showDetails, setShowDetails] = useState(false)
  const [allmangaDetails, setAllmangaDetails] = useState<Record<string, string | number> | null>(
    null
  )
  const [loadingDetails, setLoadingDetails] = useState(false)

  const { showMeta, loadingMeta, toggleWatchlist, inWatchlist } = useAnimeInfoData(showId)

  const getDisplayTitle = () => {
    if (!showMeta?.name) return ''
    if (titlePreference === 'name') return showMeta.name
    if (titlePreference === 'nativeName') return showMeta.names?.native || showMeta.name
    if (titlePreference === 'englishName') return showMeta.names?.english || showMeta.name
    return showMeta.name
  }

  const handleStartWatching = () => {
    if (showId) navigate(`/watch/${showId}`)
  }

  const loadDetails = async () => {
    if (!showId || allmangaDetails || loadingDetails) return
    setLoadingDetails(true)
    try {
      const res = await fetch(`/api/allmanga-details/${showId}`)
      if (res.ok) {
        const data = await res.json()
        setAllmangaDetails(data)
      }
    } catch (e) {
      console.warn(e)
    }
    setLoadingDetails(false)
  }

  if (loadingMeta || !showMeta?.name) {
    return (
      <div className={styles.container}>
        <div className={styles.heroSkeleton}>
          <div className={styles.skeletonPoster} />
          <div className={styles.skeletonInfo}>
            <div className={styles.skeletonTitle} />
            <div className={styles.skeletonMeta} />
            <div className={styles.skeletonDesc} />
            <div className={styles.skeletonActions} />
          </div>
        </div>
      </div>
    )
  }

  if (!showMeta?.name) {
    return (
      <div className={styles.container}>
        <ErrorMessage message="Failed to load anime info" />
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.hero}>
        <div className={styles.posterContainer}>
          <img
            src={fixThumbnailUrl(showMeta.thumbnail, 300, 420)}
            alt={showMeta.name}
            className={styles.poster}
          />
        </div>

        <div className={styles.info}>
          <h1 className={styles.title}>{getDisplayTitle()}</h1>

          <div className={styles.meta}>
            {showMeta.score && (
              <span className={styles.score}>
                <span className={styles.scoreValue}>{showMeta.score}</span>
              </span>
            )}
            {showMeta.status && <span className={styles.status}>{showMeta.status}</span>}
            {formatNextAiring(showMeta) && (
              <span className={styles.nextEpisode}>{formatNextAiring(showMeta)}</span>
            )}
          </div>

          {showMeta.genres && showMeta.genres.length > 0 && (
            <div className={styles.genres}>
              {showMeta.genres.slice(0, 5).map((g) => (
                <span key={g.name} className={styles.genre}>
                  {g.name}
                </span>
              ))}
            </div>
          )}

          <div className={styles.actions}>
            <button className={styles.watchBtn} onClick={handleStartWatching}>
              <FaPlay size={16} />
              Start Watching
            </button>
            <button
              className={`${styles.watchlistBtn} ${inWatchlist ? styles.active : ''}`}
              onClick={toggleWatchlist}
            >
              {inWatchlist ? <FaCheck size={14} /> : <FaPlus size={14} />}
              {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
            </button>
          </div>
        </div>
      </div>

      <div className={styles.details}>
        <h2 className={styles.sectionTitle}>Synopsis</h2>
        <p className={styles.description}>
          {showMeta.description
            ? showMeta.description.replace(/<[^>]*>?/gm, '')
            : 'No description available.'}
        </p>
      </div>

      <button
        className={styles.detailsToggleBtn}
        onClick={() => {
          setShowDetails(!showDetails)
          if (!showDetails && !allmangaDetails && !loadingDetails) loadDetails()
        }}
      >
        {showDetails ? <FaChevronUp /> : <FaChevronDown />}
        {showDetails ? 'Hide Details' : 'Show Details'}
      </button>

      {showDetails && (
        <>
          {loadingDetails && <p className={styles.loadingDetails}>Loading details...</p>}
          {allmangaDetails && (
            <div className={styles.detailsGridContainer}>
              {showMeta.mediaTypes?.[0] && (
                <div className={styles.detailItem}>
                  <strong>Type</strong>
                  <span>{showMeta.mediaTypes[0].name}</span>
                </div>
              )}
              {showMeta.status && (
                <div className={styles.detailItem}>
                  <strong>Status</strong>
                  <span>{showMeta.status}</span>
                </div>
              )}
              {showMeta.stats?.averageScore && (
                <div className={styles.detailItem}>
                  <strong>Score</strong>
                  <span>{showMeta.stats.averageScore}</span>
                </div>
              )}
              {showMeta.studios && showMeta.studios.length > 0 && (
                <div className={styles.detailItem}>
                  <strong>Studios</strong>
                  <span>{showMeta.studios.map((s) => s.name).join(', ')}</span>
                </div>
              )}
              {showMeta.sources?.[0] && (
                <div className={styles.detailItem}>
                  <strong>Source</strong>
                  <span>{showMeta.sources[0].name}</span>
                </div>
              )}
              {showMeta.lengthMin && (
                <div className={styles.detailItem}>
                  <strong>Episode Length</strong>
                  <span>{showMeta.lengthMin} min</span>
                </div>
              )}
              {showMeta.names?.english && (
                <div className={styles.detailItem}>
                  <strong>English Title</strong>
                  <span>{showMeta.names.english}</span>
                </div>
              )}
              {showMeta.names?.native && (
                <div className={styles.detailItem}>
                  <strong>Native Title</strong>
                  <span>{showMeta.names.native}</span>
                </div>
              )}
              {showMeta.genres && (
                <div className={styles.detailItem}>
                  <strong>Genres</strong>
                  <div className={styles.genresList}>
                    {showMeta.genres.map((g) => (
                      <span key={g.name} className={styles.genreTag}>
                        {g.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {allmangaDetails.Rating && (
                <div className={styles.detailItem}>
                  <strong>Rating</strong>
                  <span>{allmangaDetails.Rating}</span>
                </div>
              )}
              {(showMeta.season?.title || allmangaDetails.Season) && (
                <div className={styles.detailItem}>
                  <strong>Season</strong>
                  <span>{showMeta.season?.title || allmangaDetails.Season}</span>
                </div>
              )}
              {allmangaDetails.Episodes && (
                <div className={styles.detailItem}>
                  <strong>Episodes</strong>
                  <span>{allmangaDetails.Episodes}</span>
                </div>
              )}
              {allmangaDetails.Date && (
                <div className={styles.detailItem}>
                  <strong>Date</strong>
                  <span>{allmangaDetails.Date}</span>
                </div>
              )}
              {allmangaDetails['Original Broadcast'] && (
                <div className={styles.detailItem}>
                  <strong>Original Broadcast</strong>
                  <span>{allmangaDetails['Original Broadcast']}</span>
                </div>
              )}
            </div>
          )}
          {showMeta.websites && (
            <div className={styles.externalLinksSection}>
              <strong>External Links</strong>
              <div className={styles.externalLinksGrid}>
                {showMeta.websites.official && (
                  <a
                    href={ensureHttpProtocol(showMeta.websites.official)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.websiteLink}
                  >
                    Official
                  </a>
                )}
                {showMeta.websites.mal && (
                  <a
                    href={ensureHttpProtocol(showMeta.websites.mal)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.websiteLink}
                  >
                    MAL
                  </a>
                )}
                {showMeta.websites.aniList && (
                  <a
                    href={ensureHttpProtocol(showMeta.websites.aniList)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.websiteLink}
                  >
                    AniList
                  </a>
                )}
                {showMeta.websites.kitsu && (
                  <a
                    href={ensureHttpProtocol(showMeta.websites.kitsu)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.websiteLink}
                  >
                    Kitsu
                  </a>
                )}
                {showMeta.websites.animePlanet && (
                  <a
                    href={ensureHttpProtocol(showMeta.websites.animePlanet)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.websiteLink}
                  >
                    Anime-Planet
                  </a>
                )}
                {showMeta.websites.anidb && (
                  <a
                    href={ensureHttpProtocol(showMeta.websites.anidb)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.websiteLink}
                  >
                    AniDB
                  </a>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
