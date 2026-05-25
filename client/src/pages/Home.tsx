import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import {
  FaBars,
  FaChevronDown,
  FaChevronLeft,
  FaChevronRight,
  FaChevronUp,
  FaHistory,
  FaTimes,
} from 'react-icons/fa'
import { Button } from '../components/common/Button'
import AnimeSection from '../components/anime/AnimeSection'
import TrendingList from '../components/anime/TrendingList'
import Schedule from '../components/anime/Schedule'
import AnimeCard from '../components/anime/AnimeCard'
import SkeletonGrid from '../components/common/SkeletonGrid'
import RemoveConfirmationModal from '../components/common/RemoveConfirmationModal'
import SpotlightBanner from '../components/anime/SpotlightBanner'
import {
  useLatestReleases,
  useInfiniteLatestReleases,
  usePaginatedCurrentSeason,
  useContinueWatchingFast,
  useContinueWatchingUpNext,
  useRemoveFromWatchlist,
  usePopularAnime,
  useQueue,
  useRemoveFromQueue,
  useReorderQueue,
} from '../hooks/useAnimeData'
import type { QueueItem } from '../hooks/useAnimeData'
import { useTitlePreference } from '../contexts/TitlePreferenceContext'
import { fixThumbnailUrl } from '../lib/utils'
import styles from './Home.module.css'

type ActiveTab = 'latest' | 'season' | 'popular'

interface QuickQueueItemProps {
  item: QueueItem
  onRemove: (item: QueueItem) => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDragEnd: (e: React.DragEvent) => void
  isDragging: boolean
}

const QuickQueueItem = ({
  item,
  onRemove,
  onDragStart,
  onDragEnter,
  onDragEnd,
  isDragging,
}: QuickQueueItemProps) => {
  const navigate = useNavigate()
  const { titlePreference } = useTitlePreference()

  const displayTitle =
    (item[titlePreference as keyof QueueItem] as string) || item.name || 'Unknown show'

  return (
    <div
      className={`${styles.quickQueueItem} ${isDragging ? styles.dragging : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
    >
      <button className={styles.quickQueueDrag} type="button" aria-label="Drag queue item">
        <FaBars />
      </button>
      <img
        className={styles.quickQueueThumb}
        src={fixThumbnailUrl(item.thumbnail || '', 72, 96)}
        alt={displayTitle}
        onError={(event) => {
          event.currentTarget.src = '/placeholder.svg'
        }}
      />
      <div className={styles.quickQueueMeta}>
        <button
          className={styles.quickQueueName}
          type="button"
          onClick={() => navigate(`/watch/${item.showId}/${item.episodeNumber}`)}
        >
          {displayTitle}
        </button>
        <div className={styles.quickQueueEpisode}>Episode {item.episodeNumber}</div>
      </div>
      <button
        className={styles.quickQueueRemove}
        type="button"
        onClick={() => onRemove(item)}
        aria-label={`Remove ${displayTitle} episode ${item.episodeNumber} from queue`}
      >
        <FaTimes />
      </button>
    </div>
  )
}

const Home: React.FC = () => {
  const queryClient = useQueryClient()
  const [page, setPage] = React.useState(1)
  const [activeTab, setActiveTab] = useState(
    () => (localStorage.getItem('home_activeTab') as ActiveTab) || 'latest'
  )
  const seasonalRef = useRef<HTMLDivElement>(null)

  const { data: nextPageData } = usePaginatedCurrentSeason(page + 1)

  const { titlePreference } = useTitlePreference()
  const [itemToRemove, setItemToRemove] = React.useState<{ id: string; name: string } | null>(null)
  const [isQueueOpen, setIsQueueOpen] = useState(true)
  const removeWatchlistMutation = useRemoveFromWatchlist()
  const { data: queueData = [] } = useQueue()
  const [localQueue, setLocalQueue] = React.useState<QueueItem[]>([])
  const [draggedIndex, setDraggedIndex] = React.useState<number | null>(null)

  const removeQueue = useRemoveFromQueue()
  const reorderQueue = useReorderQueue()

  useEffect(() => {
    setLocalQueue(queueData)
  }, [queueData])

  useEffect(() => {
    document.title = 'Home - ani-web'
  }, [])

  useEffect(() => {
    localStorage.setItem('home_activeTab', activeTab)
  }, [activeTab])

  const {
    data: latestInfinite,
    isLoading: loadingLatestInfinite,
    fetchNextPage: fetchMoreLatest,
    hasNextPage: hasMoreLatest,
    isFetchingNextPage: fetchingMoreLatest,
  } = useInfiniteLatestReleases(14)

  const latestList = useMemo(() => {
    return latestInfinite?.pages.flatMap((page) => page) || []
  }, [latestInfinite])

  const handleLatestScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (!hasMoreLatest || fetchingMoreLatest || loadingLatestInfinite) return
      const { scrollLeft, clientWidth, scrollWidth } = e.currentTarget
      if (scrollLeft + clientWidth > scrollWidth * 0.7) {
        fetchMoreLatest()
      }
    },
    [hasMoreLatest, fetchingMoreLatest, loadingLatestInfinite, fetchMoreLatest]
  )

  const { data: popularWeekly } = usePopularAnime('weekly')
  const { data: cwFast, isLoading: loadingFast } = useContinueWatchingFast(14)
  const { data: cwUpNext, isLoading: loadingUpNext } = useContinueWatchingUpNext()
  const loadingCw = loadingFast || loadingUpNext

  const cwList = useMemo(() => {
    const combined: typeof cwFast = []
    const seen = new Set<string>()

    if (cwFast) {
      for (const show of cwFast) {
        combined.push(show)
        seen.add(show.id)
      }
    }

    if (cwUpNext) {
      for (const show of cwUpNext) {
        if (!seen.has(show.id)) {
          combined.push(show)
          seen.add(show.id)
        }
      }
    }

    return combined.length > 0 ? combined : cwFast || []
  }, [cwFast, cwUpNext])

  const { data: currentSeason, isLoading: loadingSeason } = usePaginatedCurrentSeason(page)
  const seasonLimit = 14

  const canGoNext =
    currentSeason && currentSeason.length >= 14 && nextPageData && nextPageData.length > 0

  const removeCw = useMutation({
    mutationFn: async (showId: string) => {
      await fetch('/api/continue-watching/remove', {
        method: 'POST',
        body: JSON.stringify({ showId }),
        headers: { 'Content-Type': 'application/json' },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['continueWatchingFast'] })
      queryClient.invalidateQueries({ queryKey: ['continueWatchingUpNext'] })
    },
  })

  const handleRemove = useCallback(
    (id: string) => {
      const show = cwList?.find((s) => String(s.id) === String(id))
      if (show) {
        const displayTitle = (show[titlePreference as keyof typeof show] as string) || show.name
        setItemToRemove({ id, name: displayTitle })
      }
    },
    [cwList, titlePreference]
  )

  const handleConfirmRemove = useCallback(
    (options: { removeFromWatchlist?: boolean }) => {
      if (!itemToRemove) return
      removeCw.mutate(itemToRemove.id)
      if (options.removeFromWatchlist) removeWatchlistMutation.mutate(itemToRemove.id)
      setItemToRemove(null)
    },
    [itemToRemove, removeCw, removeWatchlistMutation]
  )

  const handleQueueRemove = useCallback(
    (item: QueueItem) => {
      removeQueue.mutate({ showId: item.showId, episodeNumber: item.episodeNumber })
    },
    [removeQueue]
  )

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

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: 'latest', label: 'Latest Releases' },
    { key: 'season', label: 'Current Season' },
    { key: 'popular', label: 'Trending' },
  ]

  const renderTabContent = () => {
    switch (activeTab) {
      case 'latest':
        return (
          <AnimeSection
            title="Latest Releases"
            animeList={latestList}
            loading={loadingLatestInfinite}
            carousel
            onScroll={handleLatestScroll}
            isFetchingNextPage={fetchingMoreLatest}
          />
        )
      case 'season':
        return (
          <section style={{ marginBottom: '2.5rem' }}>
            <div className={styles['section-header']} ref={seasonalRef}>
              <div className={styles['title-wrapper']}>
                <div className="section-title" style={{ marginBottom: 0 }}>
                  Current Season
                </div>
                <div className={styles['pagination-controls']}>
                  <button
                    className={styles['nav-button']}
                    onClick={() => {
                      if (page > 1) {
                        setPage((p) => p - 1)
                        if (seasonalRef.current) {
                          const y =
                            seasonalRef.current.getBoundingClientRect().top + window.scrollY - 120
                          window.scrollTo({ top: y, behavior: 'smooth' })
                        }
                      }
                    }}
                    disabled={page === 1}
                    style={{ opacity: page === 1 ? 0.3 : 1 }}
                  >
                    <FaChevronLeft size={14} />
                  </button>
                  <span className={styles['page-info']}>{page}</span>
                  <button
                    className={styles['nav-button']}
                    onClick={() => {
                      setPage((p) => p + 1)
                      if (seasonalRef.current) {
                        const y =
                          seasonalRef.current.getBoundingClientRect().top + window.scrollY - 120
                        window.scrollTo({ top: y, behavior: 'smooth' })
                      }
                    }}
                    disabled={!canGoNext}
                    style={{ opacity: canGoNext ? 1 : 0.3 }}
                  >
                    <FaChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div
              className={`grid-container ${styles.seasonGrid}`}
              style={{
                minHeight: '300px',
                alignContent: 'start',
              }}
            >
              {loadingSeason ? (
                <SkeletonGrid count={seasonLimit} />
              ) : (
                currentSeason
                  ?.slice(0, seasonLimit)
                  .map((anime) => <AnimeCard key={anime._id} anime={anime} />)
              )}
            </div>
          </section>
        )
      case 'popular':
        return <TrendingList title="Trending" />
      default:
        return null
    }
  }

  return (
    <div style={{ paddingBottom: '2rem' }}>
      <SpotlightBanner animeList={popularWeekly || []} />
      {localQueue.length > 0 && (
        <section className={styles.quickQueue}>
          <button
            type="button"
            className={styles.quickQueueHeader}
            onClick={() => setIsQueueOpen((open) => !open)}
          >
            <span className={styles.quickQueueTitle}>
              Quick Queue
              <span className={styles.queueBadge}>{localQueue.length}</span>
            </span>
            {isQueueOpen ? <FaChevronUp /> : <FaChevronDown />}
          </button>

          {isQueueOpen && (
            <div className={styles.quickQueueList}>
              {localQueue.map((item, index) => (
                <QuickQueueItem
                  key={item.id}
                  item={item}
                  onRemove={handleQueueRemove}
                  onDragStart={() => handleDragStart(index)}
                  onDragEnter={() => handleDragEnter(index)}
                  onDragEnd={handleDragEnd}
                  isDragging={draggedIndex === index}
                />
              ))}
            </div>
          )}
        </section>
      )}
      {/* ── Continue Watching ── */}
      <AnimeSection
        title="Continue Watching"
        animeList={cwList || []}
        continueWatching
        carousel
        onRemove={handleRemove}
        showSeeMore={cwList !== undefined && cwList.length > 0}
        loading={loadingFast}
        emptyState={
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4rem 2rem',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-secondary)',
              textAlign: 'center',
              gap: '1rem',
              width: '100%',
              minHeight: '280px',
            }}
          >
            <FaHistory
              size={40}
              style={{ color: 'var(--accent)', opacity: 0.6, marginBottom: '0.5rem' }}
            />
            <div>
              <h3
                style={{
                  fontSize: '1.2rem',
                  fontWeight: 'var(--font-weight-semibold)',
                  marginBottom: '0.4rem',
                  color: 'var(--text-primary)',
                }}
              >
                Nothing is here...
              </h3>
              <p
                style={{
                  fontSize: '0.9rem',
                  color: 'var(--text-secondary)',
                  maxWidth: '300px',
                }}
              >
                You haven't watched anything yet. Start exploring and watch something first!
              </p>
            </div>
          </div>
        }
      />

      {/* ── Tab Selector ── */}
      <div className={styles.tabBar}>
        {tabs.map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? 'primary' : 'secondary'}
            size="sm"
            className={`${styles.tabButton} ${activeTab === tab.key ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className={styles.tabContent}>{renderTabContent()}</div>

      <Schedule />

      <RemoveConfirmationModal
        isOpen={!!itemToRemove}
        onClose={() => setItemToRemove(null)}
        onConfirm={handleConfirmRemove}
        animeName={itemToRemove?.name || ''}
        scenario="continueWatching"
      />
    </div>
  )
}

export default Home
