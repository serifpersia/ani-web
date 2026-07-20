import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  FaPlay,
  FaPlus,
  FaCheck,
  FaChevronDown,
  FaChevronUp,
  FaStar,
  FaTv,
  FaLayerGroup,
} from 'react-icons/fa'
import { useState, useMemo, useEffect } from 'react'
import { useAnimeInfoData } from '../../hooks/useAnimeInfoData'
import { useAddToQueue, useQueue, useRemoveFromQueue } from '../../hooks/useAnimeData'
import { fixThumbnailUrl } from '../../lib/utils'
import { getSuggestedEpisode } from '../../lib/queue'
import { useTitlePreference } from '../../contexts/TitlePreferenceContext'
import styles from './AnimeInfo.module.css'
import AnimeMetaDetails from './AnimeMetaDetails'
import SynopsisText from './SynopsisText'

export default function AnimeInfo() {
  const { id: showId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { titlePreference } = useTitlePreference()
  const [showDetails, setShowDetails] = useState(false)
  const [queueConfirmed, setQueueConfirmed] = useState(false)

  const { showMeta, loadingMeta, toggleWatchlist, inWatchlist } = useAnimeInfoData(showId)

  useEffect(() => {
    if (showId && showMeta?.id && showMeta.id !== showId) {
      navigate(`/anime/${showMeta.id}`, { replace: true })
    }
  }, [showId, showMeta, navigate])
  const { data: queue = [] } = useQueue()
  const addQueue = useAddToQueue()
  const removeQueue = useRemoveFromQueue()
  const { data: suggestedEpisode } = useQuery({
    queryKey: ['suggestedEpisode', showId],
    queryFn: () => getSuggestedEpisode(showId as string),
    enabled: !!showId,
  })

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

  const queuedItem = useMemo(() => {
    if (!showId || !suggestedEpisode) return undefined
    return queue.find(
      (item) => item.showId === showId && item.episodeNumber === suggestedEpisode.episodeNumber
    )
  }, [queue, showId, suggestedEpisode])

  const handleQueueToggle = async () => {
    if (!showId || !showMeta) return
    const suggestion = suggestedEpisode || (await getSuggestedEpisode(showId))

    if (queuedItem) {
      removeQueue.mutate({ showId, episodeNumber: queuedItem.episodeNumber })
      return
    }

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

  const bannerUrl = useMemo(() => {
    if (showMeta?.bannerImage) return fixThumbnailUrl(showMeta.bannerImage)
    if (!showMeta?.thumbnail) return ''
    return fixThumbnailUrl(showMeta.thumbnail, 1200, 450)
  }, [showMeta?.bannerImage, showMeta?.thumbnail])

  if (loadingMeta || !showMeta?.name) {
    return (
      <div className={styles.container}>
        <div className={styles.heroSkeleton}>
          <div className={styles.skeletonBanner} />
          <div className={styles.skeletonContent}>
            <div className={styles.skeletonPoster} />
            <div className={styles.skeletonInfo}>
              <div className={styles.skeletonTitle} />
              <div className={styles.skeletonMeta} />
              <div className={styles.skeletonDesc} />
              <div className={styles.skeletonActions} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.heroSection}>
        <div className={styles.bannerContainer}>
          <div className={styles.banner} style={{ backgroundImage: `url(${bannerUrl})` }} />
          <div className={styles.bannerOverlay} />
        </div>

        <div className={styles.heroContent}>
          <div className={styles.posterContainer}>
            <img
              src={fixThumbnailUrl(showMeta.thumbnail || '', 320, 480)}
              alt={showMeta.name}
              className={styles.poster}
            />
          </div>

          <div className={styles.infoGlass}>
            <div className={styles.topInfo}>
              <h1 className={styles.title}>{getDisplayTitle()}</h1>

              <div className={styles.quickMeta}>
                {showMeta.score && (
                  <div className={styles.metaItem}>
                    <FaStar className={styles.iconStar} />
                    <span>{showMeta.score}</span>
                  </div>
                )}
                {showMeta.status && (
                  <div className={styles.metaItem}>
                    <FaTv className={styles.iconTv} />
                    <span>{showMeta.status}</span>
                  </div>
                )}
                {showMeta.type && (
                  <div className={styles.metaItem}>
                    <FaLayerGroup className={styles.iconType} />
                    <span>{showMeta.type}</span>
                  </div>
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
            </div>

            <div className={styles.synopsisSection}>
              <h2 className={styles.sectionTitleSmall}>Synopsis</h2>
              <SynopsisText
                text={showMeta.description ? showMeta.description.replace(/<[^>]*>?/gm, '') : ''}
                emptyText="No description available."
              />
            </div>

            <div className={styles.actions}>
              <button className={styles.watchBtn} onClick={handleStartWatching}>
                <FaPlay size={14} />
                Start Watching
              </button>
              <button
                className={`${styles.watchlistBtn} ${inWatchlist ? styles.active : ''}`}
                onClick={toggleWatchlist}
              >
                {inWatchlist ? <FaCheck size={14} /> : <FaPlus size={14} />}
                {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
              </button>
              <button
                className={`${styles.watchlistBtn} ${queuedItem || queueConfirmed ? styles.active : ''}`}
                onClick={handleQueueToggle}
              >
                {queuedItem || queueConfirmed ? <FaCheck size={14} /> : <FaPlus size={14} />}
                {queuedItem || queueConfirmed ? 'Queued' : 'Queue'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.detailsSection}>
        <button
          className={styles.detailsToggleBtn}
          onClick={() => {
            setShowDetails(!showDetails)
          }}
        >
          {showDetails ? <FaChevronUp /> : <FaChevronDown />}
          {showDetails ? 'Hide Details' : 'Show Details'}
        </button>

        {showDetails && (
          <div className={styles.expandedContent}>
            <AnimeMetaDetails showMeta={showMeta} styles={styles} />
          </div>
        )}
      </div>
    </div>
  )
}
