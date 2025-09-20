import React from 'react';
import { Link } from 'react-router-dom';
import { fixThumbnailUrl, formatTime } from '../../lib/utils';
import styles from './AnimeCard.module.css';

// Define the types for the anime prop
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

interface AnimeCardProps {
  anime: Anime;
  continueWatching?: boolean;
  onRemove?: (id: string) => void;
}

const AnimeCard: React.FC<AnimeCardProps> = ({ anime, continueWatching = false, onRemove }) => {
  const [currentImageSrc, setCurrentImageSrc] = React.useState(fixThumbnailUrl(anime.thumbnail));
  const [imageLoaded, setImageLoaded] = React.useState(false);

  React.useEffect(() => {
    setCurrentImageSrc(fixThumbnailUrl(anime.thumbnail));
    setImageLoaded(false);
  }, [anime.thumbnail]);

  const progressPercent = continueWatching && anime.currentTime && anime.duration
    ? (anime.currentTime / anime.duration) * 100
    : 0;

  const formattedCurrentTime = anime.currentTime ? formatTime(anime.currentTime) : '00:00';
  const formattedDuration = anime.duration ? formatTime(anime.duration) : '00:00';

  const handleRemove = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (onRemove) {
      onRemove(anime.id);
    }
  };

  return (
    <Link to={continueWatching ? `/player/${anime._id}/${anime.episodeNumber}` : `/player/${anime._id}`} className={styles.card}>
      <div className={styles.posterContainer}> {/* New container for image and placeholder */}
        {!imageLoaded && <div className={styles.imagePlaceholder}></div>} {/* Temporary placeholder */}
        <img 
          src={currentImageSrc} 
          alt={anime.name} 
          className={`${styles.posterImg} ${imageLoaded ? styles.loaded : ''}`} 
          loading="lazy" 
          onLoad={() => setImageLoaded(true)} /* Set imageLoaded to true on successful load */
          onError={() => {
            setCurrentImageSrc('/placeholder.svg'); /* Update state to placeholder */
            setImageLoaded(true); /* Set imageLoaded to true even if placeholder is loaded */
          }}
        />
      </div>
      <div className={styles.info}>
        {continueWatching && (
          <button className={styles.removeBtn} onClick={handleRemove}>x</button>
        )}
        <div className={styles.title}>{anime.name}</div>
        <div className={styles.showType}>{anime.type || 'TV'}</div>
        {continueWatching ? (
          <>
            <div className={styles.progressBar}>
              <div className={styles.progress} style={{ width: `${progressPercent}%` }}></div>
            </div>
            <div className={styles.details}>
              Ep {anime.episodeNumber} | {formattedCurrentTime} / {formattedDuration}
            </div>
          </>
        ) : (
          <div className={styles.details}>
            {anime.availableEpisodesDetail?.sub && (
              <span>Sub: {anime.availableEpisodesDetail.sub.length}</span>
            )}
            {anime.availableEpisodesDetail?.dub && (
              <span> Dub: {anime.availableEpisodesDetail.dub.length}</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
};

export default AnimeCard;