import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa'
import AnimeCard from './AnimeCard'
import ErrorMessage from '../common/ErrorMessage'
import { useInfiniteLatestReleases } from '../../hooks/useAnimeData'
import styles from './TrendingList.module.css'
import { useLowEndMode } from '../../contexts/LowEndModeContext'

const formatOptions = [
  { value: 'TV', label: 'TV' },
  { value: 'ONA', label: 'ONA' },
  { value: 'OVA', label: 'OVA' },
  { value: 'MOVIE', label: 'Movie' },
  { value: 'ALL', label: 'All' },
  { value: 'ADULT', label: 'Mature' },
]

const PAGE_SIZE = 10

export default function LatestReleasesList() {
  const { lowEndMode } = useLowEndMode()
  const [format, setFormat] = useState(() => {
    return localStorage.getItem('latest_releases_format') || 'TV'
  })
  const carouselRef = useRef<HTMLDivElement>(null)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error } =
    useInfiniteLatestReleases(format, PAGE_SIZE)

  const animeList = useMemo(() => {
    return data?.pages.flatMap((page) => page) || []
  }, [data])

  useEffect(() => {
    localStorage.setItem('latest_releases_format', format)
  }, [format])

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
      <div className={styles['section-header']}>
        <div className={styles['title-wrapper']}>
          <div className="section-title" style={{ marginBottom: 0 }}>
            Latest Releases
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
            value={format}
            onChange={(e) => setFormat(e.currentTarget.value)}
          >
            {formatOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

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
            {animeList.map((item) => (
              <div key={item._id} className={styles.carouselItem}>
                <AnimeCard anime={item} />
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
