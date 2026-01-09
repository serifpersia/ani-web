import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import AnimeCard from '../components/anime/AnimeCard';
import SkeletonGrid from '../components/common/SkeletonGrid';
import ErrorMessage from '../components/common/ErrorMessage';
import RemoveConfirmationModal from '../components/common/RemoveConfirmationModal';

import { useInfiniteWatchlist, useRemoveFromWatchlist, useAllContinueWatching } from '../hooks/useAnimeData';
import { useSetting, useUpdateSetting } from '../hooks/useSettings';
import styles from './Watchlist.module.css';

const FILTERS = ['All', 'Continue Watching', 'Watching', 'Completed', 'On-Hold', 'Dropped', 'Planned'];

const Watchlist: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { filter: filterBy = 'All' } = useParams<{ filter: string }>();
  const [sortBy, setSortBy] = useState("last_added");

  // Modal State
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [itemToRemove, setItemToRemove] = useState<{id: string, name: string} | null>(null);

  useEffect(() => {
    document.title = `${filterBy} - Watchlist - ani-web`;
  }, [filterBy]);

  // Data Fetching
  const {
    data: watchlistPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error
  } = useInfiniteWatchlist(filterBy);

  const watchlist = useMemo(() => watchlistPages?.pages.flat() || [], [watchlistPages]);

  const {
    data: continueWatchingPages,
    fetchNextPage: fetchNextCW,
    hasNextPage: hasNextCW,
    isFetchingNextPage: isFetchingNextCW,
    isLoading: loadingCW,
    isError: isErrorCW,
    error: errorCW
  } = useAllContinueWatching();

  const cwList = useMemo(() => continueWatchingPages?.pages.flat() || [], [continueWatchingPages]);

  // Mutations
  const removeCwMutation = useMutation({
    mutationFn: async (showId: string) => {
      const res = await fetch("/api/continue-watching/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showId }),
      });
      if (!res.ok) throw new Error("Failed to remove");
    },
    onSuccess: () => {
      toast.success('Removed from Continue Watching');
      queryClient.invalidateQueries({ queryKey: ['allContinueWatching'] });
    },
    onError: (err) => toast.error(`Error: ${err.message}`)
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch('/api/watchlist/status', {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
    },
    onSuccess: () => {
      toast.success('Status updated');
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
    onError: (err) => toast.error(`Error: ${err.message}`)
  });

  const removeMutation = useRemoveFromWatchlist();
  const { data: skipConfirm } = useSetting('skipRemoveConfirmation');
  const updateSetting = useUpdateSetting();

  // Handlers
  const handleRemoveClick = useCallback((id: string, name: string) => {
    if (skipConfirm === true) {
      removeMutation.mutate(id);
    } else {
      setItemToRemove({ id, name });
      setShowRemoveModal(true);
    }
  }, [skipConfirm, removeMutation]);

  const handleConfirmRemove = useCallback((opts: { rememberPreference?: boolean }) => {
    if (itemToRemove) {
      removeMutation.mutate(itemToRemove.id);
      if (opts.rememberPreference) {
        updateSetting.mutate({ key: 'skipRemoveConfirmation', value: true });
      }
      setItemToRemove(null);
      setShowRemoveModal(false);
    }
  }, [itemToRemove, removeMutation, updateSetting]);

  // Derived State Logic
  const isContinueWatching = filterBy === 'Continue Watching';
  const listToDisplay = isContinueWatching ? cwList : watchlist;
  const isLoadingList = isContinueWatching ? loadingCW : isLoading;
  const hasNextList = isContinueWatching ? hasNextCW : hasNextPage;
  const fetchNextList = isContinueWatching ? fetchNextCW : fetchNextPage;
  const isFetchingNextList = isContinueWatching ? isFetchingNextCW : isFetchingNextPage;
  const errorList = isContinueWatching ? errorCW : error;
  const isErrorList = isContinueWatching ? isErrorCW : isError;

  const sortedList = useMemo(() => {
    return [...listToDisplay].sort((a, b) => {
      if (sortBy === "name_asc") return a.name.localeCompare(b.name);
      if (sortBy === "name_desc") return b.name.localeCompare(a.name);
      return 0; // Default: last added/watched
    });
  }, [listToDisplay, sortBy]);

  // Infinite Scroll
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500 && !isFetchingNextList && hasNextList) {
        fetchNextList();
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isFetchingNextList, hasNextList, fetchNextList]);

  return (
    <div className="page-container">
    <h1 className="section-title">My Watchlist</h1>

    <div className={styles.controlsContainer}>
    <div className={styles.filterGroup}>
    {FILTERS.map(status => (
      <button
      key={status}
      className={`${styles.filterBtn} ${filterBy === status ? styles.active : ''}`}
      onClick={() => navigate(`/watchlist/${status}`)}
      >
      {status}
      </button>
    ))}
    </div>

    <select
    value={sortBy}
    onChange={e => setSortBy(e.target.value)}
    className={`form-select ${styles.sortSelect}`}
    >
    <option value="last_added">Last Added</option>
    <option value="name_asc">Name (A-Z)</option>
    <option value="name_desc">Name (Z-A)</option>
    </select>
    </div>

    {isLoadingList ? (
      <SkeletonGrid count={18} />
    ) : isErrorList ? (
      <ErrorMessage message={errorList?.message || 'Error loading watchlist'} />
    ) : sortedList.length === 0 ? (
      <div className={styles.emptyState}>
      <h3>Your list is empty</h3>
      <p>Go explore and add some anime to track your progress!</p>
      <button className="btn btn-primary" onClick={() => navigate('/search')} style={{marginTop: '1rem'}}>
      Browse Anime
      </button>
      </div>
    ) : (
      <div className="grid-container">
      {sortedList.map(item => (
        <div key={item.id || item._id} className={styles.itemWrapper}>
        <AnimeCard
        anime={item}
        continueWatching={isContinueWatching}
        onRemove={isContinueWatching ? (id) => removeCwMutation.mutate(id) : undefined}
        />

        {!isContinueWatching && (
          <div className={styles.itemControls}>
          <select
          className={styles.statusSelect}
          value={item.status}
          onChange={(e) => updateStatusMutation.mutate({ id: item.id, status: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          >
          {FILTERS.slice(2).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
          className={`btn btn-danger ${styles.removeBtn}`}
          onClick={(e) => {
            e.preventDefault();
            handleRemoveClick(item.id, item.name);
          }}
          title="Remove from watchlist"
          >
          ×
          </button>
          </div>
        )}
        </div>
      ))}
      {isFetchingNextList && <SkeletonGrid count={6} />}
      </div>
    )}

    {!hasNextList && sortedList.length > 0 && (
      <p style={{textAlign: 'center', margin: '2rem 0', color: 'var(--text-secondary)'}}>End of list</p>
    )}

    <RemoveConfirmationModal
    isOpen={showRemoveModal}
    onClose={() => setShowRemoveModal(false)}
    onConfirm={handleConfirmRemove}
    animeName={itemToRemove?.name || ''}
    scenario="watchlist"
    />
    </div>
  );
};

export default Watchlist;
