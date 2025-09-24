import React, { useState, useEffect, useCallback } from 'react';
import AnimeCard from '../components/anime/AnimeCard';
import AnimeCardSkeleton from '../components/anime/AnimeCardSkeleton';
import ErrorMessage from '../components/common/ErrorMessage';

interface WatchlistItem {
  id: string;
  name: string;
  thumbnail: string;
  status: string;
  type?: string;
  availableEpisodesDetail?: {
    sub?: string[];
    dub?: string[];
  };
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


  const fetchAnimeDetails = React.useCallback(async (showId: string, showName?: string) => {
    try {
      const searchPromise = showName 
        ? fetch(`/api/search?query=${encodeURIComponent(showName)}`).then(res => res.ok ? res.json() : Promise.resolve(null))
        : Promise.resolve(null);

      const [searchResult, subEpisodesResponse, dubEpisodesResponse] = await Promise.all([
        searchPromise,
        fetch(`/api/episodes?showId=${showId}&mode=sub`),
        fetch(`/api/episodes?showId=${showId}&mode=dub`)
      ]);

      if (!subEpisodesResponse.ok || !dubEpisodesResponse.ok) {
        console.error(`Failed to fetch episodes for ${showId}`);
        return null;
      }
      
      const subEpisodeData = await subEpisodesResponse.json();
      const dubEpisodeData = await dubEpisodesResponse.json();

      let animeDetails;
      if (searchResult && searchResult.length > 0) {
        const show = searchResult.find(s => s._id === showId) || searchResult[0];
        animeDetails = {
          _id: show._id,
          id: show._id,
          name: show.name,
          thumbnail: show.thumbnail,
          type: show.type,
          availableEpisodesDetail: {
            sub: subEpisodeData.episodes,
            dub: dubEpisodeData.episodes,
          },
        };
      } else {
        const metaResponse = await fetch(`/api/show-meta/${showId}`);
        if (!metaResponse.ok) {
          console.error(`Failed to fetch show metadata for ${showId}`);
          return null;
        }
        const meta = await metaResponse.json();
        animeDetails = {
          _id: showId,
          id: showId,
          name: meta.name,
          thumbnail: meta.thumbnail,
          type: 'TV',
          availableEpisodesDetail: {
            sub: subEpisodeData.episodes,
            dub: dubEpisodeData.episodes,
          },
        };
      }
      
      return animeDetails;
    } catch (error) {
      console.error(`Error fetching details for ${showId}:`, error);
      return null;
    }
  }, []);

  const fetchWatchlist = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/watchlist?sort=${sortBy}`);
      if (!response.ok) throw new Error('Failed to fetch watchlist');
      const data = await response.json();

      const detailedWatchlist = await Promise.all(
        data.map(async (item: WatchlistItem) => {
          const animeDetails = await fetchAnimeDetails(item.id, item.name);
          return {
            ...item,
            ...animeDetails,
          };
        })
      );

      setWatchlist(detailedWatchlist);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, [sortBy, fetchAnimeDetails]);

  useEffect(() => {
    fetchWatchlist();
  }, [sortBy, filterBy, fetchWatchlist]);

  const updateStatus = async (id: string, status: string) => {
    try {
      const response = await fetch('/api/watchlist/status', {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
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
      const response = await fetch('/api/watchlist/remove', {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
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
          {watchlist
            .filter(item => filterBy === 'All' || item.status === filterBy)
            .map(item => {
            const animeForCard = {
              _id: item.id,
              id: item.id,
              name: item.name,
              thumbnail: item.thumbnail,
              type: item.type,
              availableEpisodesDetail: item.availableEpisodesDetail,
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