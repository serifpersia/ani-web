
import React from 'react';
import AnimeCard from './AnimeCard';
import AnimeCardSkeleton from './AnimeCardSkeleton';

interface Anime {
  _id: string;
  id: string;
  name: string;
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
}

const AnimeSection: React.FC<AnimeSectionProps> = React.memo(
  ({ title, animeList, continueWatching = false, onRemove, loading }) => {
    const handleRemoveCard = (id: string) => {
      if (onRemove) {
        onRemove(id);
      }
      console.log("Remove card event dispatched for id:", id);
    };

    return (
      <section>
        <h2 className="section-title">{title}</h2>
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
