import React from 'react';
import { Link } from 'react-router-dom';
import AnimeCard from './AnimeCard';
import SkeletonGrid from '../common/SkeletonGrid';
import styles from './AnimeSection.module.css';

interface Anime {
  _id: string;
  id: string;
  name: string;
  thumbnail: string;
  [key: string]: any;
}

interface AnimeSectionProps {
  title: string;
  animeList: Anime[];
  continueWatching?: boolean;
  onRemove?: (id: string) => void;
  loading?: boolean;
  showSeeMore?: boolean;
}

const AnimeSection: React.FC<AnimeSectionProps> = ({
  title,
  animeList,
  continueWatching,
  onRemove,
  loading,
  showSeeMore
}) => {
  if (!loading && animeList.length === 0) return null;

  return (
    <section style={{ marginBottom: '2.5rem' }}>
    <div className={styles['section-header']}>
    <div className="section-title" style={{ marginBottom: 0 }}>{title}</div>
    {showSeeMore && (
      <Link to="/watchlist/Continue Watching" className="btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
      View All
      </Link>
    )}
    </div>

    <div className="grid-container">
    {loading ? (
      <SkeletonGrid count={6} />
    ) : (
      animeList.map(anime => (
        <AnimeCard
        key={anime._id}
        anime={anime}
        continueWatching={continueWatching}
        onRemove={onRemove}
        />
      ))
    )}
    </div>
    </section>
  );
};

export default React.memo(AnimeSection);