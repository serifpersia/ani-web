import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fixThumbnailUrl } from '../../lib/utils';
import ErrorMessage from '../common/ErrorMessage';

// Define the type for the anime item
interface AnimeItem {
  _id: string;
  name: string;
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

  useEffect(() => {
    const fetchTop10List = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/popular/${timeframe}`);
        if (!response.ok) throw new Error("Failed to fetch top 10 popular");
        const data = await response.json();
        setTop10List(data);
      } catch (e: any) {
        setError(e.message);
        console.error(`Error fetching top 10 popular for ${timeframe}:`, e);
      } finally {
        setLoading(false);
      }
    };

    fetchTop10List();
  }, [timeframe]);

  const renderSkeletons = () => (
    <div>
        {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} style={{display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 0'}}>
                <div style={{width: '30px', height: '27px', backgroundColor: 'var(--dark-border)', borderRadius: '4px'}}></div>
                <div style={{width: '50px', height: '70px', backgroundColor: 'var(--dark-border)', borderRadius: '4px'}}></div>
                <div style={{flexGrow: 1}}>
                    <div style={{height: '20px', backgroundColor: 'var(--dark-border)', borderRadius: '4px'}}></div>
                    <div style={{height: '16px', width: '60%', backgroundColor: 'var(--dark-border)', borderRadius: '4px', marginTop: '0.5rem'}}></div>
                </div>
            </div>
        ))}
    </div>
  );

  return (
    <div className="top-10-list content-card">
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <h3>{title}</h3>
        <select value={timeframe} onChange={e => setTimeframe(e.target.value)} className="form-input" style={{width: 'auto'}}>
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
        <div>
          {top10List.map((item, i) => (
            <Link to={`/player/${item._id}`} key={item._id} className="list-item">
              <div className="rank">{i + 1}</div>
              <img 
                src={fixThumbnailUrl(item.thumbnail)} 
                alt={item.name} 
                className="poster-img" 
                loading="lazy" 
                onError={(e) => { 
                  const target = e.target as HTMLImageElement;
                  target.src = '/placeholder.png'; 
                  target.className = 'poster-img loaded';
                }}
              />
              <div className="item-info">
                <div className="title">{item.name}</div>
                <div className="details">
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