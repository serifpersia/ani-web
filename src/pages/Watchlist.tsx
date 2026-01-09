import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FaTrash } from 'react-icons/fa';

import AnimeCard from '../components/anime/AnimeCard';
import SkeletonGrid from '../components/common/SkeletonGrid';
import ErrorMessage from '../components/common/ErrorMessage';
import RemoveConfirmationModal from '../components/common/RemoveConfirmationModal';

import { useInfiniteWatchlist, useRemoveFromWatchlist, useAllContinueWatching } from '../hooks/useAnimeData';
import { useSetting, useUpdateSetting } from '../hooks/useSettings';
import styles from './Watchlist.module.css';

const FILTERS = ['All', 'Continue Watching', 'Watching', 'Completed', 'On-Hold', 'Dropped', 'Planned'];

const Watchlist: React.FC = () => {
  const { filter: filterBy = 'All' } = useParams<{ filter: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sortBy, setSortBy] = useState("last_added");

  // Modal State
  const [itemToRemove, setItemToRemove] = useState<{id: string, name: string} | null>(null);

  const isCW = filterBy === 'Continue Watching';

  // Hooks
  const { data: cwData, isLoading: loadingCW, error: errorCW } = useAllContinueWatching();
  const { data: wlData, isLoading: loadingWL, error: errorWL } = useInfiniteWatchlist(filterBy);

  const list = isCW ? cwData?.pages.flat() || [] : wlData?.pages.flat() || [];
  const isLoading = isCW ? loadingCW : loadingWL;
  const error = isCW ? errorCW : errorWL;

  // Mutations
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: string }) => {
      await fetch('/api/watchlist/status', { method: 'POST', body: JSON.stringify({ id, status }), headers: {'Content-Type': 'application/json'} });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      toast.success('Status updated');
    }
  });

  const removeCw = useMutation({
    mutationFn: async (showId: string) => {
      await fetch('/api/continue-watching/remove', { method: 'POST', body: JSON.stringify({ showId }), headers: {'Content-Type': 'application/json'} });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allContinueWatching'] })
  });

  const removeWl = useRemoveFromWatchlist();
  const { data: skipConfirm } = useSetting('skipRemoveConfirmation');
  const updateSetting = useUpdateSetting();

  // Logic
  const sortedList = useMemo(() => {
    return [...list].sort((a, b) => {
      if (sortBy === "name_asc") return a.name.localeCompare(b.name);
      if (sortBy === "name_desc") return b.name.localeCompare(a.name);
      return 0;
    });
  }, [list, sortBy]);

  const handleRemove = (id: string, name: string) => {
    if (skipConfirm) {
      isCW ? removeCw.mutate(id) : removeWl.mutate(id);
    } else {
      setItemToRemove({ id, name });
    }
  };

  const confirmRemove = (opts: { rememberPreference?: boolean }) => {
    if (!itemToRemove) return;
    isCW ? removeCw.mutate(itemToRemove.id) : removeWl.mutate(itemToRemove.id);
    if (opts.rememberPreference) updateSetting.mutate({ key: 'skipRemoveConfirmation', value: true });
    setItemToRemove(null);
  };

  return (
    <div className="page-container">
    <div className="section-title">My Watchlist</div>

    <div className={styles.controls}>
    <div className={styles.filters}>
    {FILTERS.map(f => (
      <button
      key={f}
      className={`${styles.filterBtn} ${filterBy === f ? styles.active : ''}`}
      onClick={() => navigate(`/watchlist/${f}`)}
      >
      {f}
      </button>
    ))}
    </div>
    <select
    className={`form-select ${styles.sortSelect}`}
    value={sortBy}
    onChange={e => setSortBy(e.target.value)}
    >
    <option value="last_added">Recently Added</option>
    <option value="name_asc">Name (A-Z)</option>
    <option value="name_desc">Name (Z-A)</option>
    </select>
    </div>

    {isLoading ? <SkeletonGrid /> : error ? <ErrorMessage message={error.message} /> : (
      <div className="grid-container">
      {sortedList.map(item => (
        <div key={item._id} className={styles.itemWrapper}>
        <AnimeCard anime={item} continueWatching={isCW} onRemove={() => handleRemove(item.id, item.name)} />
        {!isCW && (
          <div className={styles.cardActions}>
          <select
          className={styles.statusSelect}
          value={item.status}
          onChange={(e) => updateStatus.mutate({ id: item.id, status: e.target.value })}
          >
          {FILTERS.slice(2).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className={styles.removeBtn} onClick={() => handleRemove(item.id, item.name)}>
          <FaTrash size={12} />
          </button>
          </div>
        )}
        </div>
      ))}
      </div>
    )}

    {!isLoading && sortedList.length === 0 && (
      <div className={styles.emptyState}>No anime found in this list.</div>
    )}

    <RemoveConfirmationModal
    isOpen={!!itemToRemove}
    onClose={() => setItemToRemove(null)}
    onConfirm={confirmRemove}
    animeName={itemToRemove?.name || ''}
    scenario={isCW ? 'continueWatching' : 'watchlist'}
    />
    </div>
  );
};

export default Watchlist;
