import React, { useEffect, useState } from 'react';
import styles from './AnimeInfoPopup.module.css';

interface ShowDetails {
  title: string;
  description: string;
  genres: { name: string }[];
}

interface AnimeInfoPopupProps {
  animeId: string;
  isVisible: boolean;
}

const AnimeInfoPopup: React.FC<AnimeInfoPopupProps> = ({ animeId, isVisible }) => {
  const [details, setDetails] = useState<ShowDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isVisible) {
      setLoading(true);
      const fetchDetails = async () => {
        try {
          const response = await fetch(`/api/show-details/${animeId}`);
          if (!response.ok) {
            throw new Error('Failed to fetch details');
          }
          const data = await response.json();
          setDetails(data);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
          setLoading(false);
        }
      };

      fetchDetails();
    }
  }, [animeId, isVisible]);

  return (
    <div className={`${styles.popup} ${isVisible ? styles.visible : ''}`}>
      {loading ? (
        <div className={styles.spinner}></div>
      ) : error ? (
        <div>Error: {error}</div>
      ) : details ? (
        <>
          <h3>{details.title}</h3>
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
