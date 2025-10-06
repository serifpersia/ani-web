import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AnimeCard from '../components/anime/AnimeCard';
import AnimeCardSkeleton from '../components/anime/AnimeCardSkeleton';
import ErrorMessage from '../components/common/ErrorMessage';
import { useInfiniteWatchlist, useRemoveFromWatchlist, useAllContinueWatching } from '../hooks/useAnimeData';
import { useSetting, useUpdateSetting } from '../hooks/useSettings';
import RemoveConfirmationModal from '../components/common/RemoveConfirmationModal';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

const SkeletonGrid = React.memo(() => (
    <div className="grid-container">
        {Array.from({ length: 10 }).map((_, i) => <AnimeCardSkeleton key={i} />)}
    </div>
));

const Watchlist: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { filter: filterBy = 'All' } = useParams<{ filter: string }>();
  const [sortBy, setSortBy] = useState("last_added");
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [animeToRemoveId, setAnimeToRemoveId] = useState<string | null>(null);
  const [animeToRemoveName, setAnimeToRemoveName] = useState<string | null>(null);



  const { data: watchlistPages, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error } = useInfiniteWatchlist(filterBy);
  const watchlist = useMemo(() => watchlistPages?.pages.flat() || [], [watchlistPages]);
  
  const {
    data: continueWatchingPages,
    fetchNextPage: fetchNextContinueWatching,
    hasNextPage: hasNextContinueWatching,
    isFetchingNextPage: isFetchingNextContinueWatching,
    isLoading: loadingAllContinueWatching,
    isError: isErrorAllContinueWatching,
    error: errorAllContinueWatching
  } = useAllContinueWatching();

  const allContinueWatchingList = useMemo(() => continueWatchingPages?.pages.flat() || [], [continueWatchingPages]);

  const removeContinueWatchingMutation = useMutation({
    mutationFn: async (showId: string) => {
      const response = await fetch("/api/continue-watching/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showId }),
      });
      if (!response.ok) throw new Error("Failed to remove from backend");
    },
    onSuccess: () => {
      toast.success('Removed from Continue Watching');
      queryClient.invalidateQueries({ queryKey: ['allContinueWatching'] });
    },
    onError: (error) => {
      toast.error(`Failed to remove: ${error.message}`);
    },
  });

  const handleRemoveContinueWatching = useCallback((showId: string) => {
    removeContinueWatchingMutation.mutate(showId);
  }, [removeContinueWatchingMutation]);

  useEffect(() => {
    const handleScroll = () => {
      const isAtBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000;
      if (filterBy === 'Continue Watching') {
        if (isAtBottom && !isFetchingNextContinueWatching && hasNextContinueWatching) {
          fetchNextContinueWatching();
        }
      } else {
        if (isAtBottom && !isFetchingNextPage && hasNextPage) {
          fetchNextPage();
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [
      fetchNextPage, hasNextPage, isFetchingNextPage,
      filterBy,
      fetchNextContinueWatching, hasNextContinueWatching, isFetchingNextContinueWatching
    ]);

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
      toast.success('Watchlist status updated');
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
    onError: (error) => {
      toast.error(`Failed to update status: ${error.message}`);
    },
  });

  const { data: skipRemoveConfirmationSetting } = useSetting('skipRemoveConfirmation');
  const skipRemoveConfirmation = skipRemoveConfirmationSetting == true;
  const updateSettingMutation = useUpdateSetting();

  const removeMutation = useRemoveFromWatchlist();

  const updateStatus = useCallback((id: string, status: string) => {
    updateStatusMutation.mutate({ id, status });
  }, [updateStatusMutation]);

  const handleRemoveClick = useCallback((id: string, name: string) => {
    if (skipRemoveConfirmation) {
      removeMutation.mutate(id);
    } else {
      setAnimeToRemoveId(id);
      setAnimeToRemoveName(name);
      setShowRemoveModal(true);
    }
  }, [skipRemoveConfirmation, removeMutation]);

  const handleConfirmRemove = useCallback((options: { rememberPreference?: boolean }) => {
    if (animeToRemoveId) {
      removeMutation.mutate(animeToRemoveId);
      if (options.rememberPreference) {
        updateSettingMutation.mutate({ key: 'skipRemoveConfirmation', value: true });
      }
      setAnimeToRemoveId(null);
      setAnimeToRemoveName(null);
      setShowRemoveModal(false);
    }
  }, [animeToRemoveId, removeMutation, updateSettingMutation]);

  const handleCancelRemove = useCallback(() => {
    setAnimeToRemoveId(null);
    setAnimeToRemoveName(null);
    setShowRemoveModal(false);
  }, []);

  const listToDisplay = useMemo(() => {
    if (filterBy === 'Continue Watching') {
      return allContinueWatchingList || [];
    }
    return watchlist || [];
  }, [watchlist, filterBy, allContinueWatchingList]);

  const sortedList = useMemo(() => {
    return [...listToDisplay].sort((a, b) => {
      if (sortBy === "name_asc") return a.name.localeCompare(b.name);
      if (sortBy === "name_desc") return b.name.localeCompare(a.name);
      return 0;
    });
  }, [listToDisplay, sortBy]);

  const isLoadingList = filterBy === 'Continue Watching' ? loadingAllContinueWatching : isLoading;
  const isErrorList = filterBy === 'Continue Watching' ? isErrorAllContinueWatching : isError;
  const errorList = filterBy === 'Continue Watching' ? errorAllContinueWatching : error;
  const isFetchingNext = filterBy === 'Continue Watching' ? isFetchingNextContinueWatching : isFetchingNextPage;
  const hasNext = filterBy === 'Continue Watching' ? hasNextContinueWatching : hasNextPage;

  return (
    <div className="page-container" style={{padding: '1rem'}}>
      <h1>My Watchlist</h1>

      <div className="watchlist-controls-container" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
        <div className="filter-buttons">
          {['All', 'Continue Watching', 'Watching', 'Completed', 'On-Hold', 'Dropped', 'Planned'].map(status => (
            <button key={status} className={`status-btn ${filterBy === status ? 'active' : ''}`} onClick={() => navigate(`/watchlist/${status}`)}>
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

      {isLoadingList ? (
        <SkeletonGrid />
      ) : isErrorList ? (
        <ErrorMessage message={errorList?.message || 'An unknown error occurred'} />
      ) : sortedList.length === 0 ? (
        <p style={{textAlign: 'center', marginTop: '1rem'}}>Your list is empty.</p>
      ) : (
        <>
          <div className="grid-container">
            {sortedList.map(item => (
              filterBy === 'Continue Watching' ? (
                <AnimeCard 
                  key={item.id || item._id}
                  anime={item} 
                  continueWatching={true} 
                  onRemove={handleRemoveContinueWatching}
                />
              ) : (
                <div key={item.id || item._id} className="watchlist-item-wrapper">
                  <AnimeCard 
                    anime={item} 
                    continueWatching={false} 
                  />
                  <div className="watchlist-controls" style={{marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                    <select
                      className="form-input"
                      value={item.status}
                      onChange={(e) => updateStatus(item.id, e.target.value)}
                      disabled={updateStatusMutation.isPending}
                    >
                      <option value="Watching">Watching</option>
                      <option value="Completed">Completed</option>
                      <option value="On-Hold">On-Hold</option>
                      <option value="Dropped">Dropped</option>
                      <option value="Planned">Planned</option>
                    </select>
                    <button 
                      className="btn-danger" 
                      onClick={() => handleRemoveClick(item.id, item.name)}
                      disabled={removeMutation.isPending}
                    >
                      {removeMutation.isPending ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                </div>
              )
            ))}
            {isFetchingNext && <SkeletonGrid />}
          </div>
          {!hasNext && sortedList.length > 0 && <p style={{textAlign: 'center', margin: '1rem'}}>No more results.</p>}
        </>
      )}

      <RemoveConfirmationModal
        isOpen={showRemoveModal}
        onClose={handleCancelRemove}
        onConfirm={handleConfirmRemove}
        animeName={animeToRemoveName || ''}
        scenario="watchlist"
      />
    </div>
  );
};

export default Watchlist;