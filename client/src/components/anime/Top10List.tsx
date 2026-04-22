import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa'
import { fixThumbnailUrl } from '../../lib/utils'
import ErrorMessage from '../common/ErrorMessage'
import { useTitlePreference } from '../../contexts/TitlePreferenceContext'
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
  const [timeframe, setTimeframe] = useState('all')
  const [isMobile, setIsMobile] = useState(false)
  const { titlePreference } = useTitlePreference()
  const carouselRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

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
      behavior: 'smooth',
    })
  }

  const getDisplayTitle = (item: AnimeItem) => {
    if (titlePreference === 'name') return item.name
    if (titlePreference === 'nativeName') return item.nativeName || item.name
    if (titlePreference === 'englishName') return item.englishName || item.name
    return item.name
  }

  const renderSkeletons = () => (
    <div className={isMobile ? styles.carousel : styles.list}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className={styles.skeletonItem}>
          <div className={styles.skeletonRank}></div>
          <div className={styles.skeletonPoster}></div>
          <div className={styles.skeletonText}></div>
        </div>
      ))}
    </div>
  )

  const renderContent = () => (
    <div className={isMobile ? styles.carousel : styles.list}>
      {top10List.map((item, i) => (
        <Link to={`/anime/${item._id}`} key={item._id} className={styles.item}>
          <div className={styles.rank}>#{i + 1}</div>
          <img
            src={fixThumbnailUrl(item.thumbnail, 130, 182)}
            alt={item.name}
            width="50"
            height="70"
            className={styles.poster}
            loading="lazy"
            decoding="async"
            onError={(e) => {
              const target = e.currentTarget as HTMLImageElement
              target.src = '/placeholder.svg'
            }}
          />
          <div className={styles.info}>
            <div className={styles.title} title={getDisplayTitle(item)}>
              {getDisplayTitle(item)}
            </div>
            <div className={styles.meta}>
              {item.availableEpisodes.sub && <span>SUB: {item.availableEpisodes.sub}</span>}
              {item.availableEpisodes.dub && <span> DUB: {item.availableEpisodes.dub}</span>}
            </div>
          </div>
        </Link>
      ))}
    </div>
  )

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>{title}</h3>
        <div className={styles.headerRight}>
          {isMobile && top10List.length > 0 && (
            <div className={styles.navArrows}>
              <button className={styles.navBtn} onClick={() => scroll('left')}>
                <FaChevronLeft />
              </button>
              <button className={styles.navBtn} onClick={() => scroll('right')}>
                <FaChevronRight />
              </button>
            </div>
          )}
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

      {loading ? (
        renderSkeletons()
      ) : error ? (
        <ErrorMessage message={error} />
      ) : (
        <>
          {isMobile ? (
            <div className={styles.carouselContainer}>
              <div className={styles.carousel} ref={carouselRef}>
                {top10List.map((item, i) => (
                  <Link to={`/anime/${item._id}`} key={item._id} className={styles.carouselItem}>
                    <div className={styles.carouselPoster}>
                      <img
                        src={fixThumbnailUrl(item.thumbnail, 130, 182)}
                        alt={item.name}
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
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            renderContent()
          )}
        </>
      )}
    </div>
  )
}
