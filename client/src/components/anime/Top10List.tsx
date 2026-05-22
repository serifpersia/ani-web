import { useState, useEffect, useRef, useCallback } from 'react'
import type { MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { FaChevronLeft, FaChevronRight, FaInfo } from 'react-icons/fa'
import { fixThumbnailUrl } from '../../lib/utils'
import ErrorMessage from '../common/ErrorMessage'
import AnimePopup from './AnimePopup'
import { useTitlePreference } from '../../contexts/TitlePreferenceContext'
import { useLowEndMode } from '../../contexts/LowEndModeContext'
import styles from './Top10List.module.css'

interface AnimeItem {
  _id: string
  name: string
  nativeName?: string
  englishName?: string
  thumbnail: string
  availableEpisodes: {
    sub?: number
    dub?: number
  }
}

interface Top10ListProps {
  title: string
}

const timeframeOptions = [
  { value: 'all', label: 'All Time' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'daily', label: 'Daily' },
]

export default function Top10List({ title }: Top10ListProps) {
  const [top10List, setTop10List] = useState<AnimeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeframe, setTimeframe] = useState(() => {
    return localStorage.getItem('top10_timeframe') || 'all'
  })
  const { titlePreference } = useTitlePreference()
  const { lowEndMode } = useLowEndMode()
  const carouselRef = useRef<HTMLDivElement>(null)
  const [isPopupVisible, setIsPopupVisible] = useState(false)
  const [hoveredShowId, setHoveredShowId] = useState('')
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleInfoMouseEnter = useCallback((e: MouseEvent, showId: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setAnchorRect(rect)
    setHoveredShowId(showId)
    setIsPopupVisible(true)
  }, [])

  const handleInfoMouseLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      setIsPopupVisible(false)
    }, 300)
  }, [])

  const handlePopupMouseEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  const handlePopupMouseLeave = useCallback(() => {
    setIsPopupVisible(false)
  }, [])

  useEffect(() => {
    localStorage.setItem('top10_timeframe', timeframe)
  }, [timeframe])

  useEffect(() => {
    const fetchTop10List = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/popular/${timeframe}`)
        if (!response.ok) throw new Error('Failed to fetch top 10 popular')
        const data = await response.json()
        setTop10List(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'An unknown error occurred')
      } finally {
        setLoading(false)
      }
    }
    fetchTop10List()
  }, [timeframe])

  const scroll = (direction: 'left' | 'right') => {
    if (!carouselRef.current) return
    const { scrollLeft, clientWidth } = carouselRef.current
    const offset = clientWidth * 0.8
    carouselRef.current.scrollTo({
      left: direction === 'left' ? scrollLeft - offset : scrollLeft + offset,
      behavior: lowEndMode ? 'auto' : 'smooth',
    })
  }

  const getDisplayTitle = (item: AnimeItem) => {
    if (titlePreference === 'nativeName') return item.nativeName || item.name
    if (titlePreference === 'englishName') return item.englishName || item.name
    return item.name
  }

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
              onClick={() => scroll('left')}
              aria-label="Scroll left"
            >
              <FaChevronLeft />
            </button>
            <button
              className={styles['nav-button']}
              onClick={() => scroll('right')}
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
      {loading ? (
        <div className={styles.carousel}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className={styles.carouselItem}>
              <div className={styles.skeletonPoster} />
              <div className={styles.skeletonText} />
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorMessage message={error} />
      ) : (
        <div className={styles.carouselContainer}>
          <div className={styles.carousel} ref={carouselRef}>
            {top10List.map((item, i) => (
              <Link to={`/anime/${item._id}`} key={item._id} className={styles.carouselItem}>
                <div className={styles.carouselPoster}>
                  <img
                    src={fixThumbnailUrl(item.thumbnail, 130, 182)}
                    alt={getDisplayTitle(item)}
                    width="100"
                    height="140"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement
                      target.src = '/placeholder.svg'
                    }}
                  />
                  <div className={styles.carouselRank}>#{i + 1}</div>
                </div>
                <div className={styles.carouselTitle} title={getDisplayTitle(item)}>
                  {getDisplayTitle(item)}
                </div>
                <button
                  className={styles.infoBtn}
                  onMouseEnter={(e) => handleInfoMouseEnter(e, item._id)}
                  onMouseLeave={handleInfoMouseLeave}
                  onClick={(e) => e.preventDefault()}
                  aria-label="Info"
                >
                  <FaInfo size={14} />
                </button>
              </Link>
            ))}
          </div>
        </div>
      )}

      {isPopupVisible && anchorRect && (
        <AnimePopup
          showId={hoveredShowId}
          anchorRect={anchorRect}
          onMouseEnter={handlePopupMouseEnter}
          onMouseLeave={handlePopupMouseLeave}
        />
      )}
    </section>
  )
}
