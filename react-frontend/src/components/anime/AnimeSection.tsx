
import React from 'react';
import AnimeCard from './AnimeCard';

// Define the types for the props
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
  onRemove?: (id: string) => void; // <--- Add this prop
}

const AnimeSection: React.FC<AnimeSectionProps> = ({ title, animeList, continueWatching = false, onRemove }) => { // <--- Destructure onRemove
  const handleRemoveCard = (id: string) => {
    if (onRemove) { // <--- Call the passed onRemove prop
      onRemove(id);
    }
    console.log("Remove card event dispatched for id:", id); // Keep for debugging if needed, but main logic moves to parent
  };

  return (
    <section>
      <h2 className="section-title">{title}</h2>
      <div className="grid-container">
        {animeList.map(anime => (
          <AnimeCard 
            key={anime._id} 
            anime={anime} 
            continueWatching={continueWatching} 
            onRemove={handleRemoveCard} 
          />
        ))}
      </div>
    </section>
  );
};

export default AnimeSection;
