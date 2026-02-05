import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fixThumbnailUrl } from '../../lib/utils';
import ErrorMessage from '../common/ErrorMessage';
import { useTitlePreference } from '../../contexts/TitlePreferenceContext';
import styles from './Top10List.module.css';

interface AnimeItem {
  _id: string;
  name: string;
  nativeName?: string;
  englishName?: string;
  thumbnail: string;
  availableEpisodes: {
    sub?: number;
    dub?: number;
  };
}

interface Top10ListProps {
  title: string;
}

const Top10List: React.FC<Top10ListProps> = ({ title }) => {
  const [top10List, setTop10List] = useState<AnimeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState('all');
  const { titlePreference } = useTitlePreference();

  useEffect(() => {
    const fetchTop10List = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/popular/${timeframe}`);
        if (!response.ok) throw new Error("Failed to fetch top 10 popular");
        const data = await response.json();
        setTop10List(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchTop10List();
  }, [timeframe]);

  const renderSkeletons = () => (
    <div className={styles.list}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className={styles.skeletonItem}>
          <div className={styles.skeletonRank}></div>
          <div className={styles.skeletonPoster}></div>
          <div className={styles.skeletonText}></div>
        </div>
      ))}
    </div>
  );

  const getDisplayTitle = (item: AnimeItem) => {
    if (titlePreference === 'name') return item.name;
    if (titlePreference === 'nativeName') return item.nativeName || item.name;
    if (titlePreference === 'englishName') return item.englishName || item.name;
    return item.name;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>{title}</h3>
        <select
          id="timeframe-select"
          aria-label="Filter by timeframe"
          value={timeframe}
          onChange={e => setTimeframe(e.target.value)}
          className={styles.timeSelect}
        >
          <option value="all">All Time</option>
          <option value="monthly">Monthly</option>
          <option value="weekly">Weekly</option>
          <option value="daily">Daily</option>
        </select>
      </div>

      {loading ? (
        renderSkeletons()
      ) : error ? (
        <ErrorMessage message={error} />
      ) : (
        <div className={styles.list}>
          {top10List.map((item, i) => (
            <Link to={`/player/${item._id}`} key={item._id} className={styles.item}>
              <div className={styles.rank}>#{i + 1}</div>
              <img
                src={fixThumbnailUrl(item.thumbnail, 50, 70)}
                alt={item.name}
                width="50"
                height="70"
                className={styles.poster}
                loading="lazy"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = '/placeholder.svg';
                }}
              />
              <div className={styles.info}>
                <div className={styles.title} title={getDisplayTitle(item)}>{getDisplayTitle(item)}</div>
                <div className={styles.meta}>
                  {item.availableEpisodes.sub && (
                    <span>SUB: {item.availableEpisodes.sub}</span>
                  )}
                  {item.availableEpisodes.dub && (
                    <span> DUB: {item.availableEpisodes.dub}</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Top10List;