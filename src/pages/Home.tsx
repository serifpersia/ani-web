import React, { useEffect, useCallback } from 'react';
import AnimeSection from '../components/anime/AnimeSection';
import Top10List from '../components/anime/Top10List';
import Schedule from '../components/anime/Schedule';
import AnimeCardSkeleton from '../components/anime/AnimeCardSkeleton';
import type { Anime as _Anime } from '../hooks/useAnimeData';
import { useLatestReleases, useCurrentSeason, useContinueWatching } from '../hooks/useAnimeData';
import { useQueryClient, useMutation } from '@tanstack/react-query';

const SkeletonGrid = React.memo(() => (
    <div className="grid-container">
        {Array.from({ length: 10 }).map((_, i) => <AnimeCardSkeleton key={i} />)}
    </div>
));

const Home: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: latestReleases, isLoading: loadingLatestReleases } = useLatestReleases();
  const {
    data: currentSeasonPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loadingCurrentSeason,
  } = useCurrentSeason();

  const currentSeason = currentSeasonPages?.pages.flat() || [];

  const { data: continueWatchingList, isLoading: loadingContinueWatching } = useContinueWatching();

  const removeContinueWatchingMutation = useMutation({
    mutationFn: async (showId: string) => {
      const response = await fetch("/api/continue-watching/remove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ showId }),
      });
      if (!response.ok) {
        throw new Error("Failed to remove from backend");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['continueWatching'] });
    },
    onError: (error) => {
      console.error("Error removing from continue watching:", error);
    },
  });

  const handleRemoveContinueWatching = useCallback((showId: string) => {
    removeContinueWatchingMutation.mutate(showId);
  }, [removeContinueWatchingMutation]);

  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000 &&
        !isFetchingNextPage &&
        hasNextPage
      ) {
        fetchNextPage();
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);

  return (
    <div>
      <div className="home-container">
        <div className="main-content">
          <AnimeSection 
            title="Continue Watching" 
            continueWatching={true} 
            animeList={continueWatchingList || []} 
            onRemove={handleRemoveContinueWatching} 
            loading={loadingContinueWatching}
          />

          <AnimeSection title="Latest Releases" continueWatching={false} animeList={latestReleases || []} loading={loadingLatestReleases} />

          <AnimeSection title="Current Season" continueWatching={false} animeList={currentSeason} loading={loadingCurrentSeason || isFetchingNextPage} />
          {(loadingCurrentSeason || isFetchingNextPage) && <SkeletonGrid />}
          {!hasNextPage && currentSeason.length > 0 && <p style={{textAlign: 'center', margin: '1rem'}}>No more Current Season anime.</p>}
        </div>
        <aside className="sidebar">
          <Top10List title="Top 10 Popular" />
        </aside>
      </div>
      <Schedule />
    </div>
  );
};

export default Home;
