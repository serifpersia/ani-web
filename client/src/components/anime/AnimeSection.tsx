import React, { useRef } from 'react'
import { Link } from 'react-router-dom'
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa'
import AnimeCard from './AnimeCard'
import AnimeCardSkeleton from './AnimeCardSkeleton'
import SkeletonGrid from '../common/SkeletonGrid'
import styles from './AnimeSection.module.css'

interface Anime {
  _id: string
  id: string
  name: string
  thumbnail: string
  nativeName?: string
  englishName?: string
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

interface AnimeSectionProps {
  title: string
  animeList: Anime[]
  continueWatching?: boolean
  onRemove?: (id: string) => void
  loading?: boolean
  showSeeMore?: boolean
  emptyState?: React.ReactNode
  carousel?: boolean
}

const AnimeSection: React.FC<AnimeSectionProps> = ({
  title,
  animeList,
  continueWatching,
  onRemove,
  loading,
  showSeeMore,
  emptyState,
  carousel,
}) => {
  const carouselRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: 'left' | 'right') => {
    if (!carouselRef.current) return
    const { scrollLeft, clientWidth } = carouselRef.current
    const offset = clientWidth * 0.8
    carouselRef.current.scrollTo({
      left: direction === 'left' ? scrollLeft - offset : scrollLeft + offset,
      behavior: 'smooth',
    })
  }

  if (!loading && animeList.length === 0 && !emptyState) return null

  return (
    <section style={{ marginBottom: '2.5rem' }}>
      <div className={styles['section-header']}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="section-title" style={{ marginBottom: 0 }}>
            {title}
          </div>
          {carousel && animeList.length > 0 && (
            <div className={styles['nav-arrows']}>
              <button className={styles['nav-button']} onClick={() => scroll('left')}>
                <FaChevronLeft />
              </button>
              <button className={styles['nav-button']} onClick={() => scroll('right')}>
                <FaChevronRight />
              </button>
            </div>
          )}
        </div>
        {showSeeMore && (
          <Link
            to="/watchlist/Continue Watching"
            className="btn-secondary"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
          >
            View All
          </Link>
        )}
      </div>

      {carousel ? (
        <div className={styles['carousel-container']}>
          <div className={styles.carousel} ref={carouselRef}>
            {loading && animeList.length === 0
              ? Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className={styles['carousel-card']}>
                    <AnimeCardSkeleton />
                  </div>
                ))
              : animeList.map((anime, index) => (
                  <div key={anime._id} className={styles['carousel-card']}>
                    <AnimeCard
                      anime={anime}
                      continueWatching={continueWatching}
                      onRemove={onRemove}
                      isLCP={index < 4 && title === 'Latest Releases'}
                    />
                  </div>
                ))}
          </div>
        </div>
      ) : (
        <div className="grid-container">
          {loading && animeList.length === 0 ? (
            <SkeletonGrid count={6} />
          ) : animeList.length > 0 ? (
            animeList.map((anime, index) => (
              <AnimeCard
                key={anime._id}
                anime={anime}
                continueWatching={continueWatching}
                onRemove={onRemove}
                isLCP={index < 4 && title === 'Latest Releases'}
              />
            ))
          ) : !loading ? (
            <div style={{ gridColumn: '1 / -1' }}>{emptyState}</div>
          ) : null}
        </div>
      )}
    </section>
  )
}

export default React.memo(AnimeSection)
