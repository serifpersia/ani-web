import React, { memo, useState } from 'react';
import RemoveConfirmationModal from '../common/RemoveConfirmationModal';
import { useRemoveFromWatchlist } from '../../hooks/useAnimeData';
import { Link } from 'react-router-dom';
import { fixThumbnailUrl, formatTime } from '../../lib/utils';
import styles from './AnimeCard.module.css';
import { FaMicrophone, FaClosedCaptioning } from 'react-icons/fa';
import useIsMobile from '../../hooks/useIsMobile';
import { useTitlePreference } from '../../contexts/TitlePreferenceContext';

interface Anime {
  _id: string;
  id: string;
  name: string;
  nativeName?: string;
  englishName?: string;
  thumbnail: string;
  type?: string;
  episodeNumber?: number;
  currentTime?: number;
  duration?: number;
  nextEpisodeToWatch?: string;
  newEpisodesCount?: number;
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
  const isMobile = useIsMobile();
  const { titlePreference } = useTitlePreference();
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const removeWatchlistMutation = useRemoveFromWatchlist();

  const isUpNext = anime.newEpisodesCount !== undefined && anime.newEpisodesCount > 0;
  const isInProgress = continueWatching && !isUpNext;

  const displayTitle = anime[titlePreference] || anime.name;

  const linkTarget = isUpNext
    ? `/player/${anime._id}/${anime.nextEpisodeToWatch}`
    : isInProgress
        ? `/player/${anime._id}/${anime.episodeNumber}`
        : `/player/${anime._id}`;

  const progressPercent = isInProgress && anime.currentTime && anime.duration
    ? (anime.currentTime / anime.duration) * 100
    : 0;

  const formattedCurrentTime = anime.currentTime ? formatTime(anime.currentTime) : '00:00';
  const formattedDuration = anime.duration ? formatTime(anime.duration) : '00:00';

  const handleRemoveClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setShowRemoveModal(true);
  };

  const handleConfirmRemove = (options: { removeFromWatchlist?: boolean }) => {
    if (onRemove) {
      onRemove(anime.id); // This removes from continue watching
    }
    if (options.removeFromWatchlist) {
      removeWatchlistMutation.mutate(anime.id);
    }
    setShowRemoveModal(false);
  };

  const handleCancelRemove = () => {
    setShowRemoveModal(false);
  };

  const episodeInfoElement = (isUpNext || isInProgress) && (
    <div className={isMobile ? styles.episodeNumberInline : styles.episodeNumberOverlay}>
      {isUpNext ? `Next: EP ${anime.nextEpisodeToWatch}` : `EP ${anime.episodeNumber}`}
    </div>
  );

  const episodeCountElement = (
    <div className={isMobile ? styles.episodeCountInline : (isInProgress ? styles.episodeCountOverlay : `${styles.episodeCountOverlay} ${styles.normalCardEpisodeCount}`)}>
      {anime.availableEpisodesDetail?.sub && anime.availableEpisodesDetail.sub.length > 0 && (
        <div className={`${styles.episodeCountItem} ${styles.subCount}`}><FaClosedCaptioning /> {anime.availableEpisodesDetail.sub.length}</div>
      )}
      {anime.availableEpisodesDetail?.dub && anime.availableEpisodesDetail.dub.length > 0 && (
        <div className={`${styles.episodeCountItem} ${styles.dubCount}`}><FaMicrophone /> {anime.availableEpisodesDetail.dub.length}</div>
      )}
    </div>
  );

  const progressElement = isInProgress && (
    <div className={styles.progressContainer}>
      <div className={styles.progressBar}>
        <div className={styles.progress} style={{ width: `${progressPercent}%` }}></div>
      </div>
      <div className={styles.timestampCentered}>
        {formattedCurrentTime} / {formattedDuration}
      </div>
    </div>
  );

  const removeButtonElement = continueWatching && (
    <button className={isMobile ? styles.removeBtnInline : styles.removeBtn} onClick={handleRemoveClick}>x</button>
  );

  const showTypeElement = (
    <div className={isMobile ? styles.showTypeInline : styles.showType}>{anime.type || 'TV'}</div>
  );

  return (
    <>
      <Link 
        to={linkTarget}
        className={styles.card}
      >
        <div className={styles.posterContainer}>
          {isUpNext && <div className={styles.newEpisodesBadge}>+{anime.newEpisodesCount} NEW</div>}
          {!isMobile && episodeInfoElement}
          {!isMobile && episodeCountElement}
          <img 
            src={fixThumbnailUrl(anime.thumbnail)} 
            alt={anime.name} 
            className={styles.posterImg} 
            loading="lazy"
            width="200"
            height="300"
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
          {isMobile && removeButtonElement}
          {progressElement}
          <div className={styles.title} title={displayTitle}>{displayTitle}</div>
          {isMobile && (
            <div className={styles.mobileDetailsBottom}>
              <div className={styles.mobileDetailsBottomLeft}>
                {showTypeElement} 
                {episodeInfoElement}
              </div>
              <div className={styles.mobileDetailsBottomRight}>
                {episodeCountElement}
              </div>
            </div>
          )}
          {!isMobile && removeButtonElement}
          {!isMobile && showTypeElement}
          {continueWatching ? null : (
            <div className={styles.details}>
            </div>
          )}
        </div>
      </Link>
      <RemoveConfirmationModal
        isOpen={showRemoveModal}
        onClose={handleCancelRemove}
        onConfirm={handleConfirmRemove}
        animeName={displayTitle}
        scenario="continueWatching"
      />
    </>
  );
});

export default AnimeCard;