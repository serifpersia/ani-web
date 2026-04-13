import React from 'react'
import { Link } from 'react-router-dom'
import AnimeCard from './AnimeCard'
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
}

const AnimeSection: React.FC<AnimeSectionProps> = ({
  title,
  animeList,
  continueWatching,
  onRemove,
  loading,
  showSeeMore,
  emptyState,
}) => {
  if (!loading && animeList.length === 0 && !emptyState) return null

  return (
    <section style={{ marginBottom: '2.5rem' }}>
      <div className={styles['section-header']}>
        <div className="section-title" style={{ marginBottom: 0 }}>
          {title}
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

      <div className="grid-container">
        {(loading && animeList.length === 0) ? (
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
    </section>
  )
}

export default React.memo(AnimeSection)
