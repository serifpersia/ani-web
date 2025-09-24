import React, { memo } from 'react';
import { Link } from 'react-router-dom';
import { fixThumbnailUrl, formatTime } from '../../lib/utils';
import styles from './AnimeCard.module.css';
import { FaMicrophone, FaClosedCaptioning } from 'react-icons/fa';
import useIsMobile from '../../hooks/useIsMobile';

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

const AnimeCard: React.FC<AnimeCardProps> = memo(({ anime, continueWatching = false, onRemove }) => {
  const [isHovered, setIsHovered] = React.useState(false); // New state for hover
  const isMobile = useIsMobile(); // Call the hook

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

  const episodeNumberElement = continueWatching && anime.episodeNumber && (
    <div className={isMobile ? styles.episodeNumberInline : styles.episodeNumberOverlay}>EP {anime.episodeNumber}</div>
  );

  const episodeCountElement = anime.availableEpisodesDetail && (
    <div className={isMobile ? styles.episodeCountInline : (continueWatching ? styles.episodeCountOverlay : `${styles.episodeCountOverlay} ${styles.normalCardEpisodeCount}`)}>
      {anime.availableEpisodesDetail.sub && anime.availableEpisodesDetail.sub.length > 0 && (
        <div className={`${styles.episodeCountItem} ${styles.subCount}`}><FaClosedCaptioning /> {anime.availableEpisodesDetail.sub.length}</div>
      )}
      {anime.availableEpisodesDetail.dub && anime.availableEpisodesDetail.dub.length > 0 && (
        <div className={`${styles.episodeCountItem} ${styles.dubCount}`}><FaMicrophone /> {anime.availableEpisodesDetail.dub.length}</div>
      )}
    </div>
  );

  const progressElement = continueWatching && (
    <div className={isMobile ? styles.progressInline : styles.progressOverlay}>
      <div className={styles.progressBar}>
        <div className={styles.progress} style={{ width: `${progressPercent}%` }}></div>
      </div>
      <div className={styles.timestampCentered}>
        {formattedCurrentTime} / {formattedDuration}
      </div>
    </div>
  );

  const removeButtonElement = continueWatching && isHovered && (
    <button className={isMobile ? styles.removeBtnInline : styles.removeBtn} onClick={handleRemove}>x</button>
  );

  const showTypeElement = (
    <div className={isMobile ? styles.showTypeInline : styles.showType}>{anime.type || 'TV'}</div>
  );

  return (
    <Link 
      to={continueWatching ? `/player/${anime._id}/${anime.episodeNumber}` : `/player/${anime._id}`}
      className={styles.card}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={styles.posterContainer}>
        {!isMobile && episodeNumberElement}
        {!isMobile && continueWatching && episodeCountElement} {}
        {!isMobile && progressElement}
        {!isMobile && !continueWatching && episodeCountElement} {}
        <img 
          src={fixThumbnailUrl(anime.thumbnail)} 
          alt={anime.name} 
          className={styles.posterImg} 
          loading="lazy"
          style={{ opacity: 0 }}
          onLoad={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
          onError={(e) => {
            e.currentTarget.src = '/placeholder.svg';
            e.currentTarget.style.opacity = '1';
          }}
        />
      </div>
      <div className={styles.info}>
        {isMobile && removeButtonElement} {}
        <div className={styles.title}>{anime.name}</div>
        {isMobile && (
          <div className={styles.mobileDetailsBottom}>
            <div className={styles.mobileDetailsBottomLeft}>
              {showTypeElement} 
              {continueWatching && episodeNumberElement} {}
            </div>
            <div className={styles.mobileDetailsBottomRight}>
              {episodeCountElement}
            </div>
          </div>
        )}
        {isMobile && progressElement} {}
        {!isMobile && continueWatching && isHovered && removeButtonElement} {}
        {!isMobile && showTypeElement} {}
        {continueWatching ? null : (
          <div className={styles.details}>
            {}
          </div>
        )}
      </div>
    </Link>
  );
});

export default AnimeCard;