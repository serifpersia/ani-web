import React, { useState, useCallback, useMemo } from 'react';
import AnimeCard from '../components/anime/AnimeCard';
import AnimeCardSkeleton from '../components/anime/AnimeCardSkeleton';
import ErrorMessage from '../components/common/ErrorMessage';
import { useWatchlist, useRemoveFromWatchlist } from '../hooks/useAnimeData';
import RemoveConfirmationModal from '../components/common/RemoveConfirmationModal';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface _WatchlistItem {
  id: string;
  name: string;
  nativeName?: string;
  englishName?: string;
  thumbnail: string;
  status: string;
  type?: string;
  availableEpisodesDetail?: {
    sub?: string[];
    dub?: string[];
  };
}

const SkeletonGrid = React.memo(() => (
    <div className="grid-container">
        {Array.from({ length: 10 }).map((_, i) => <AnimeCardSkeleton key={i} />)}
    </div>
));

const Watchlist: React.FC = () => {
  const queryClient = useQueryClient();
  const [sortBy, setSortBy] = useState("last_added");
  const [filterBy, setFilterBy] = useState("All");
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [animeToRemoveId, setAnimeToRemoveId] = useState<string | null>(null);
  const [animeToRemoveName, setAnimeToRemoveName] = useState<string | null>(null);

  const { data: watchlist, isLoading, isError, error } = useWatchlist();

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await fetch('/api/watchlist/status', {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!response.ok) throw new Error("Failed to update status");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
    onError: (e: unknown) => {
      console.error("Error updating status:", e);
      alert(`Failed to update status: ${e instanceof Error ? e.message : 'An unknown error occurred'}`);
    },
  });

  const removeMutation = useRemoveFromWatchlist();

  const updateStatus = useCallback((id: string, status: string) => {
    updateStatusMutation.mutate({ id, status });
  }, [updateStatusMutation]);

  const handleRemoveClick = useCallback((id: string, name: string) => {
    setAnimeToRemoveId(id);
    setAnimeToRemoveName(name);
    setShowRemoveModal(true);
  }, []);

  const handleConfirmRemove = useCallback(() => {
    if (animeToRemoveId) {
      removeMutation.mutate(animeToRemoveId);
      setAnimeToRemoveId(null);
      setAnimeToRemoveName(null);
      setShowRemoveModal(false);
    }
  }, [animeToRemoveId, removeMutation]);

  const handleCancelRemove = useCallback(() => {
    setAnimeToRemoveId(null);
    setAnimeToRemoveName(null);
    setShowRemoveModal(false);
  }, []);

  const filteredWatchlist = useMemo(() => {
    return watchlist?.filter(item => filterBy === 'All' || item.status === filterBy) || [];
  }, [watchlist, filterBy]);

  const sortedWatchlist = useMemo(() => {
    return [...filteredWatchlist].sort((a, b) => {
      if (sortBy === "name_asc") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "name_desc") {
        return b.name.localeCompare(a.name);
      }
      return 0;
    });
  }, [filteredWatchlist, sortBy]);

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

      {isLoading ? (
        <SkeletonGrid />
      ) : isError ? (
        <ErrorMessage message={error?.message || 'An unknown error occurred'} />
      ) : sortedWatchlist.length === 0 ? (
        <p style={{textAlign: 'center', marginTop: '1rem'}}>Your watchlist is empty.</p>
      ) : (
        <div className="grid-container">
          {sortedWatchlist.map(item => {
            const animeForCard = {
              _id: item.id,
              id: item.id,
              name: item.name,
              nativeName: item.nativeName,
              englishName: item.englishName,
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
                  <button className="btn-danger" onClick={() => handleRemoveClick(item.id, item.name)}>
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <RemoveConfirmationModal
        show={showRemoveModal}
        message={`Are you sure you want to remove ${animeToRemoveName} from your watchlist?`}
        onConfirm={handleConfirmRemove}
        onCancel={handleCancelRemove}
      />
    </div>
  );
};

export default Watchlist;