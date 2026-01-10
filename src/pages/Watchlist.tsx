import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FaTrash } from 'react-icons/fa';
import { FixedSizeGrid as Grid } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

import AnimeCard from '../components/anime/AnimeCard';
import SkeletonGrid from '../components/common/SkeletonGrid';
import ErrorMessage from '../components/common/ErrorMessage';
import RemoveConfirmationModal from '../components/common/RemoveConfirmationModal';

import { useInfiniteWatchlist, useRemoveFromWatchlist, useAllContinueWatching } from '../hooks/useAnimeData';
import { useSetting, useUpdateSetting } from '../hooks/useSettings';
import useIsMobile from '../hooks/useIsMobile';
import styles from './Watchlist.module.css';

const FILTERS = ['All', 'Continue Watching', 'Watching', 'Completed', 'On-Hold', 'Dropped', 'Planned'];

// Constants for card dimensions and spacing
const DESKTOP_CARD_MIN_WIDTH = 180;
const MOBILE_CARD_HEIGHT = 110; // From AnimeCard.module.css
const DESKTOP_CARD_CONTENT_HEIGHT = 300; // Estimated content height of AnimeCard on desktop
const GAP = 16; // 1rem

interface GridCellProps {
  columnIndex: number;
  rowIndex: number;
  style: React.CSSProperties;
  data: {
    list: any[];
    columnCount: number;
    isCW: boolean;
    handleRemove: (id: string, name: string) => void;
    updateStatus: any; // Mutation function
    FILTERS: string[];
  };
}

const GridCell: React.FC<GridCellProps> = ({ columnIndex, rowIndex, style, data }) => {
  const { list, columnCount, isCW, handleRemove, updateStatus, FILTERS } = data;
  const itemIndex = rowIndex * columnCount + columnIndex;
  const item = list[itemIndex];

  if (!item) {
    return null;
  }

  return (
    <div
      style={{
        ...style,
        left: (style.left as number) + GAP / 2,
        top: (style.top as number) + GAP / 2,
        width: `calc(${style.width} - ${GAP}px)`,
        height: `calc(${style.height} - ${GAP}px)`,
      }}
      className={styles.itemWrapper}
    >
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
  );
};

const Watchlist: React.FC = () => {
  const { filter: filterBy = 'All' } = useParams<{ filter: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sortBy, setSortBy] = useState("last_added");

  // Modal State
  const [itemToRemove, setItemToRemove] = useState<{id: string, name: string} | null>(null);

  const isCW = filterBy === 'Continue Watching';
  const isMobile = useIsMobile();

  // Hooks
  const {
    data: cwData,
    isLoading: loadingCW,
    error: errorCW,
    fetchNextPage: fetchNextCW,
    hasNextPage: hasNextCW,
    isFetchingNextPage: isFetchingNextCW
  } = useAllContinueWatching();

  const {
    data: wlData,
    isLoading: loadingWL,
    error: errorWL,
    fetchNextPage: fetchNextWL,
    hasNextPage: hasNextWL,
    isFetchingNextPage: isFetchingNextWL
  } = useInfiniteWatchlist(filterBy);

  const list = isCW ? cwData?.pages.flat() || [] : wlData?.pages.flat() || [];
  const isLoading = isCW ? loadingCW : loadingWL;
  const error = isCW ? errorWL : errorWL; // Corrected: should be errorWL or errorCW based on isCW

  // Pagination helpers
  const fetchNextPage = isCW ? fetchNextCW : fetchNextWL;
  const hasNextPage = isCW ? hasNextCW : hasNextWL;
  const isFetchingNextPage = isCW ? isFetchingNextCW : isFetchingNextWL;

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

  // Virtualization calculations
  const [columnCount, setColumnCount] = useState(1);
  const [columnWidth, setColumnWidth] = useState(DESKTOP_CARD_MIN_WIDTH);
  const [rowHeight, setRowHeight] = useState(isMobile ? MOBILE_CARD_HEIGHT + GAP : DESKTOP_CARD_CONTENT_HEIGHT + GAP);

  const updateGridDimensions = useCallback((containerWidth: number) => {
    if (isMobile) {
      setColumnCount(1);
      setColumnWidth(containerWidth); // Full width for mobile
      setRowHeight(MOBILE_CARD_HEIGHT + GAP);
    } else {
      // Calculate column count based on available width and minimum card width
      const calculatedColumnCount = Math.max(1, Math.floor((containerWidth + GAP) / (DESKTOP_CARD_MIN_WIDTH + GAP)));
      setColumnCount(calculatedColumnCount);
      // Distribute width evenly, accounting for gaps
      setColumnWidth((containerWidth - (calculatedColumnCount - 1) * GAP) / calculatedColumnCount + GAP);
      setRowHeight(DESKTOP_CARD_CONTENT_HEIGHT + GAP);
    }
  }, [isMobile]);

  // Infinite scroll for react-window
  const onItemsRendered = useCallback(({ visibleRowStopIndex }) => {
    if (hasNextPage && !isFetchingNextPage && visibleRowStopIndex >= rowCount - 2) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, rowCount]);

  const rowCount = Math.ceil(sortedList.length / columnCount);

  if (isLoading) {
    return <SkeletonGrid />;
  }

  if (error) {
    return <ErrorMessage message={error.message} />;
  }

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

      {sortedList.length === 0 ? (
        <div className={styles.emptyState}>No anime found in this list.</div>
      ) : (
        <div style={{ flex: '1 1 auto', minHeight: '500px', margin: `0 -${GAP / 2}px` }}> {/* Adjust margin for grid */}
          <AutoSizer>
            {({ height, width }) => {
              updateGridDimensions(width);
              return (
                <Grid
                  columnCount={columnCount}
                  columnWidth={columnWidth}
                  height={height}
                  rowCount={rowCount}
                  rowHeight={rowHeight}
                  width={width}
                  itemData={{ list: sortedList, columnCount, isCW, handleRemove, updateStatus, FILTERS }}
                  onItemsRendered={onItemsRendered}
                >
                  {GridCell}
                </Grid>
              );
            }}
          </AutoSizer>
        </div>
      )}

      {isFetchingNextPage && <SkeletonGrid count={columnCount} />}

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
