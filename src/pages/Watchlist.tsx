import React, { useState, useEffect } from 'react';
import AnimeCard from '../components/anime/AnimeCard';
import AnimeCardSkeleton from '../components/anime/AnimeCardSkeleton';
import ErrorMessage from '../components/common/ErrorMessage';

interface WatchlistItem {
  id: string;
  name: string;
  thumbnail: string;
  status: string;
}

const SkeletonGrid = () => (
    <div className="grid-container">
        {Array.from({ length: 10 }).map((_, i) => <AnimeCardSkeleton key={i} />)}
    </div>
);

const Watchlist: React.FC = () => {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("last_added");
  const [filterBy, setFilterBy] = useState("All");

  const fetchWithProfile = async (url: string, options: RequestInit = {}) => {
    const activeProfileId = '1';
    const newOptions: RequestInit = { ...options };
    newOptions.headers = { ...newOptions.headers, 'X-Profile-ID': activeProfileId };
    if (newOptions.body && typeof newOptions.body === 'string') {
        newOptions.headers = { ...newOptions.headers, 'Content-Type': 'application/json' };
    }
    return fetch(url, newOptions);
  };

  useEffect(() => {
    const fetchWatchlist = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchWithProfile(`/api/watchlist?sort=${sortBy}`);
        if (!response.ok) throw new Error("Failed to fetch watchlist");
        let data = await response.json();

        if (filterBy !== "All") {
          data = data.filter((item: WatchlistItem) => item.status === filterBy);
        }
        setWatchlist(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'An unknown error occurred');
        console.error("Error fetching watchlist:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchWatchlist();
  }, [sortBy, filterBy]);

  const updateStatus = async (id: string, status: string) => {
    try {
      const response = await fetchWithProfile("/api/watchlist/status", {
        method: "POST",
        body: JSON.stringify({ id, status }),
      });
      if (!response.ok) throw new Error("Failed to update status");
      const newWatchlist = watchlist.map(item => item.id === id ? { ...item, status } : item);
      setWatchlist(newWatchlist);
    } catch (e: unknown) {
      console.error("Error updating status:", e);
      alert(`Failed to update status: ${e instanceof Error ? e.message : 'An unknown error occurred'}`);
    }
  };

  const removeFromWatchlist = async (id: string) => {
    if (!confirm("Are you sure you want to remove this item from your watchlist?")) {
      return;
    }
    try {
      const response = await fetchWithProfile("/api/watchlist/remove", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error("Failed to remove from watchlist");
      setWatchlist(watchlist.filter(item => item.id !== id));
    } catch (e: unknown) {
      console.error("Error removing from watchlist:", e);
      alert(`Failed to remove from watchlist: ${e instanceof Error ? e.message : 'An unknown error occurred'}`);
    }
  };

  return (
    <div className="page-container" style={{padding: '1rem'}}>
      <h1>My Watchlist</h1>

      <div className="watchlist-controls-container" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
        <div className="filter-buttons">
          {['All', 'Watching', 'Completed', 'On-Hold', 'Dropped', 'Planned'].map(status => (
            <button 
              key={status} 
              className={`status-btn ${filterBy === status ? 'active' : ''}`} 
              onClick={() => setFilterBy(status)}
            >
              {status}
            </button>
          ))}
        </div>

        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="form-input">
          <option value="last_added">Last Added</option>
          <option value="name_asc">Name (A-Z)</option>
          <option value="name_desc">Name (Z-A)</option>
        </select>
      </div>

      {loading ? (
        <SkeletonGrid />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : watchlist.length === 0 ? (
        <p style={{textAlign: 'center', marginTop: '1rem'}}>Your watchlist is empty.</p>
      ) : (
        <div className="grid-container">
          {watchlist.map(item => {
            const animeForCard = {
              _id: item.id,
              id: item.id,
              name: item.name,
              thumbnail: item.thumbnail,
            };
            return (
              <div key={item.id} className="watchlist-item-wrapper">
                <AnimeCard anime={animeForCard} />
                <div className="watchlist-controls" style={{marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                  <select
                    className="form-input"
                    value={item.status}
                    onChange={(e) => updateStatus(item.id, e.target.value)}
                  >
                    <option value="Watching">Watching</option>
                    <option value="Completed">Completed</option>
                    <option value="On-Hold">On-Hold</option>
                    <option value="Dropped">Dropped</option>
                    <option value="Planned">Planned</option>
                  </select>
                  <button className="btn-danger" onClick={() => removeFromWatchlist(item.id)}>
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Watchlist;