import React from 'react';
import { Link } from 'react-router-dom';
import { fixThumbnailUrl, formatTime } from '../../lib/utils';
import styles from './AnimeCard.module.css';
import { FaMicrophone, FaClosedCaptioning } from 'react-icons/fa'; // Import the microphone and CC icons

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
  const [isHovered, setIsHovered] = React.useState(false); // New state for hover

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
    <Link 
      to={continueWatching ? `/player/${anime._id}/${anime.episodeNumber}` : `/player/${anime._id}`}
      className={styles.card}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={styles.posterContainer}> {/* New container for image and placeholder */}
        {continueWatching && anime.episodeNumber && (
          <div className={styles.episodeNumberOverlay}>EP {anime.episodeNumber}</div>
        )}
        {continueWatching && anime.availableEpisodesDetail && (
              <div className={styles.episodeCountOverlay}>
                            {anime.availableEpisodesDetail.sub && anime.availableEpisodesDetail.sub.length > 0 && (
                              <div className={`${styles.episodeCountItem} ${styles.subCount}`}><FaClosedCaptioning /> {anime.availableEpisodesDetail.sub.length}</div>
                            )}
                            {anime.availableEpisodesDetail.dub && anime.availableEpisodesDetail.dub.length > 0 && (
                              <div className={`${styles.episodeCountItem} ${styles.dubCount}`}><FaMicrophone /> {anime.availableEpisodesDetail.dub.length}</div>
                            )}              </div>
            )}
        {!imageLoaded && <div className={styles.imagePlaceholder}></div>} {/* Temporary placeholder */}
        {continueWatching && (
          <div className={styles.progressOverlay}>
            <div className={styles.progressBar}>
              <div className={styles.progress} style={{ width: `${progressPercent}%` }}></div>
            </div>
            <div className={styles.timestampCentered}>
              {formattedCurrentTime} / {formattedDuration}
            </div>
          </div>
        )}
        {!continueWatching && anime.availableEpisodesDetail && (
          <div className={`${styles.episodeCountOverlay} ${styles.normalCardEpisodeCount}`}>
            {anime.availableEpisodesDetail.sub && anime.availableEpisodesDetail.sub.length > 0 && (
              <div className={`${styles.episodeCountItem} ${styles.subCount}`}><FaClosedCaptioning /> {anime.availableEpisodesDetail.sub.length}</div>
            )}
            {anime.availableEpisodesDetail.dub && anime.availableEpisodesDetail.dub.length > 0 && (
              <div className={`${styles.episodeCountItem} ${styles.dubCount}`}><FaMicrophone /> {anime.availableEpisodesDetail.dub.length}</div>
            )}
          </div>
        )}
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
        {continueWatching && isHovered && (
          <button className={styles.removeBtn} onClick={handleRemove}>x</button>
        )}
        <div className={styles.title}>{anime.name}</div>
        <div className={styles.showType}>{anime.type || 'TV'}</div>
        {continueWatching ? null : (
          <div className={styles.details}>
            {/* availableEpisodesDetail moved to posterContainer */}
          </div>
        )}
      </div>
    </Link>
  );
};

export default AnimeCard;