import React, { useEffect, useState } from 'react';
import styles from './AnimeInfoPopup.module.css';
import { useTitlePreference } from '../../contexts/TitlePreferenceContext';

interface ShowDetails {
  description: string;
  genres: { name: string }[];
  averageScore?: number;
  status?: string;
  episodes?: number;
}

interface ShowMeta {
  name: string;
  englishName?: string;
  nativeName?: string;
}

interface AnimeInfoPopupProps {
  animeId: string;
  isVisible: boolean;
  position?: 'left' | 'right';
}

const AnimeInfoPopup: React.FC<AnimeInfoPopupProps> = ({ animeId, isVisible, position = 'right' }) => {
  const [details, setDetails] = useState<ShowDetails | null>(null);
  const [meta, setMeta] = useState<ShowMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { titlePreference } = useTitlePreference();

  useEffect(() => {
    if (isVisible) {
      setLoading(true);
      const fetchAllDetails = async () => {
        try {
          const [detailsResponse, metaResponse] = await Promise.all([
            fetch(`/api/show-details/${animeId}`),
            fetch(`/api/show-meta/${animeId}`)
          ]);

          if (!detailsResponse.ok || !metaResponse.ok) {
            throw new Error('Failed to fetch details');
          }

          const detailsData = await detailsResponse.json();
          const metaData = await metaResponse.json();

          setDetails(detailsData);
          setMeta(metaData);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
          setLoading(false);
        }
      };

      fetchAllDetails();
    }
  }, [animeId, isVisible]);

  const getTitle = () => {
    if (!meta) return '';
    const title = meta[titlePreference];
    return title || meta.name;
  };

  return (
    <div className={`${styles.popup} ${isVisible ? styles.visible : ''} ${position === 'left' ? styles.left : ''}`}>
      {loading ? (
        <div className={styles.spinner}></div>
      ) : error ? (
        <div>Error: {error}</div>
      ) : details ? (
        <>
          <h3>{getTitle()}</h3>
          <div className={styles.detailsGrid}>
            {details.averageScore && <div><strong>Score:</strong> {details.averageScore}</div>}
            {details.status && <div><strong>Status:</strong> {details.status}</div>}
            {details.episodes && <div><strong>Episodes:</strong> {details.episodes}</div>}
          </div>
          <p dangerouslySetInnerHTML={{ __html: details.description }}></p>
          <div className={styles.genres}>
            {details.genres.map((genre) => (
              <span key={genre.name} className={styles.genre}>{genre.name}</span>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
};

export default AnimeInfoPopup;
