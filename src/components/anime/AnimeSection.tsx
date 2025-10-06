
import React from 'react';
import { Link } from 'react-router-dom';
import AnimeCard from './AnimeCard';
import AnimeCardSkeleton from './AnimeCardSkeleton';
import styles from './AnimeSection.module.css';

interface Anime {
  _id: string;
  id:string;
  name: string;
  nativeName?: string;
  englishName?: string;
  thumbnail: string;
  type?: string;
  episodeNumber?: number;
  currentTime?: number;
  duration?: number;
  availableEpisodesDetail?: {
    sub?: string[];
    dub?: string[];
  };
}

interface AnimeSectionProps {
  title: string;
  animeList: Anime[];
  continueWatching?: boolean;
  onRemove?: (id: string) => void;
  loading?: boolean;
  showSeeMore?: boolean;
}

const AnimeSection: React.FC<AnimeSectionProps> = React.memo(
  ({ title, animeList, continueWatching = false, onRemove, loading, showSeeMore = false }) => {
    const handleRemoveCard = (id: string) => {
      if (onRemove) {
        onRemove(id);
      }
    };

    return (
      <section>
        <div className={styles['section-header']}>
          <h2 className="section-title">{title}</h2>
          {showSeeMore && (
            <Link to="/watchlist/Continue Watching" className={styles['see-more-button']}>
              See More
            </Link>
          )}
        </div>
        <div className="grid-container">
          {loading ? (
            Array.from({ length: 10 }).map((_, i) => <AnimeCardSkeleton key={i} />)
          ) : (
            animeList.map(anime => (
              <AnimeCard 
                key={anime._id} 
                anime={anime} 
                continueWatching={continueWatching} 
                onRemove={handleRemoveCard} 
              />
            ))
          )}
        </div>
      </section>
    );
  }
);
export default AnimeSection;
