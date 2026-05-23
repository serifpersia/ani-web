import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa'
import ErrorMessage from '../common/ErrorMessage'
import AnimeCard from './AnimeCard'
import { useInfinitePopularAnime } from '../../hooks/useAnimeData'
import styles from './TrendingList.module.css'
import { useLowEndMode } from '../../contexts/LowEndModeContext'

interface TrendingListProps {
  title: string
}

const timeframeOptions = [
  { value: 'all', label: 'All Time' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'daily', label: 'Daily' },
]

const PAGE_SIZE = 10 // Fetch 10 so there's always some overflow if 7 are shown

export default function TrendingList({ title }: TrendingListProps) {
  const { lowEndMode } = useLowEndMode()
  const [timeframe, setTimeframe] = useState(() => {
    return localStorage.getItem('trending_timeframe') || 'all'
  })
  const carouselRef = useRef<HTMLDivElement>(null)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error } =
    useInfinitePopularAnime(timeframe, PAGE_SIZE)

  const trendingList = useMemo(() => {
    return data?.pages.flatMap((page) => page) || []
  }, [data])

  useEffect(() => {
    localStorage.setItem('trending_timeframe', timeframe)
  }, [timeframe])

  const handleScroll = useCallback(() => {
    if (!carouselRef.current || !hasNextPage || isFetchingNextPage || isLoading) return

    const { scrollLeft, clientWidth, scrollWidth } = carouselRef.current
    if (scrollLeft + clientWidth > scrollWidth * 0.6) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, isLoading, fetchNextPage])

  const scroll = useCallback(
    (direction: 'left' | 'right') => {
      const container = carouselRef.current
      if (!container) return

      const { scrollLeft, clientWidth, scrollWidth } = container
      const offset = clientWidth * 0.8

      if (direction === 'right' && hasNextPage && !isFetchingNextPage) {
        if (scrollLeft + clientWidth > scrollWidth - 100) {
          fetchNextPage()
        }
      }

      container.scrollTo({
        left: direction === 'left' ? scrollLeft - offset : scrollLeft + offset,
        behavior: lowEndMode ? 'auto' : 'smooth',
      })
    },
    [lowEndMode, hasNextPage, isFetchingNextPage, fetchNextPage]
  )

  return (
    <section style={{ marginBottom: '2.5rem' }}>
      {/* Header — matches AnimeSection header style */}
      <div className={styles['section-header']}>
        <div className={styles['title-wrapper']}>
          <div className="section-title" style={{ marginBottom: 0 }}>
            {title}
          </div>
          <div className={styles['nav-arrows']}>
            <button
              className={styles['nav-button']}
              type="button"
              onClick={(e) => {
                e.preventDefault()
                scroll('left')
              }}
              aria-label="Scroll left"
            >
              <FaChevronLeft />
            </button>
            <button
              className={styles['nav-button']}
              type="button"
              onClick={(e) => {
                e.preventDefault()
                scroll('right')
              }}
              aria-label="Scroll right"
            >
              <FaChevronRight />
            </button>
          </div>
        </div>

        <div className={styles['header-actions']}>
          <select
            className={styles.timeSelect}
            value={timeframe}
            onChange={(e) => setTimeframe(e.currentTarget.value)}
          >
            {timeframeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Carousel */}
      {isLoading ? (
        <div className={styles.carousel}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className={styles.carouselItem}>
              <div className={styles.skeletonPoster} />
              <div className={styles.skeletonText} />
            </div>
          ))}
        </div>
      ) : isError ? (
        <ErrorMessage
          message={error instanceof Error ? error.message : 'An unknown error occurred'}
        />
      ) : (
        <div className={styles.carouselContainer}>
          <div className={styles.carousel} ref={carouselRef} onScroll={handleScroll}>
            {trendingList.map((item, i) => (
              <div key={item._id} className={styles.carouselItem}>
                <AnimeCard anime={item} rank={i + 1} />
              </div>
            ))}
            {isFetchingNextPage && (
              <div
                className={styles.carouselItem}
                style={{
                  minWidth: '150px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div className={styles.skeletonPoster} />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
