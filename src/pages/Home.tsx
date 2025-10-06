import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import AnimeCard from '../components/anime/AnimeCard';
import AnimeSection from '../components/anime/AnimeSection';
import Top10List from '../components/anime/Top10List';
import Schedule from '../components/anime/Schedule';
import AnimeCardSkeleton from '../components/anime/AnimeCardSkeleton';
import type { Anime as _Anime } from '../hooks/useAnimeData';
import { useLatestReleases, useCurrentSeason, useContinueWatching } from '../hooks/useAnimeData';
import { useQueryClient, useMutation } from '@tanstack/react-query';

const SkeletonGrid = React.memo(() => (
    <>
        {Array.from({ length: 10 }).map((_, i) => <AnimeCardSkeleton key={i} />)}
    </>
));

const Home: React.FC = () => {
  const queryClient = useQueryClient();

  const invalidationRef = useRef(false);

  useEffect(() => {
    if (!invalidationRef.current) {
      queryClient.invalidateQueries({ queryKey: ['continueWatching'] });
      invalidationRef.current = true;
    }
  }, [queryClient]);

  const { data: latestReleases, isLoading: loadingLatestReleases } = useLatestReleases();
  const {
    data: currentSeasonPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loadingCurrentSeason,
  } = useCurrentSeason();

  const currentSeason = useMemo(() => currentSeasonPages?.pages.flat() || [], [currentSeasonPages]);

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
            showSeeMore={true}
          />

          <AnimeSection title="Latest Releases" continueWatching={false} animeList={latestReleases || []} loading={loadingLatestReleases} />

          <section>
            <h2 className="section-title">Current Season</h2>
            <div className="grid-container">
              {currentSeason.map(anime => (
                <AnimeCard 
                  key={anime._id} 
                  anime={anime} 
                />
              ))}
              {(loadingCurrentSeason || isFetchingNextPage) && <SkeletonGrid />}
            </div>
            {!hasNextPage && currentSeason.length > 0 && <p style={{textAlign: 'center', margin: '1rem'}}>No more Current Season anime.</p>}
          </section>
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