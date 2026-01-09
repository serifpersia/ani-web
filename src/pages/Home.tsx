import React, { useEffect, useMemo } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import AnimeSection from '../components/anime/AnimeSection';
import Top10List from '../components/anime/Top10List';
import Schedule from '../components/anime/Schedule';
import AnimeCard from '../components/anime/AnimeCard';
import SkeletonGrid from '../components/common/SkeletonGrid';
import { useLatestReleases, useCurrentSeason, useContinueWatching } from '../hooks/useAnimeData';
import useIsMobile from '../hooks/useIsMobile';

const Home: React.FC = () => {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  useEffect(() => {
    document.title = 'Home - ani-web';
  }, []);

  const { data: latest, isLoading: loadingLatest } = useLatestReleases();
  const { data: cwList } = useContinueWatching(6);
  const { data: seasonPages, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading: loadingSeason } = useCurrentSeason();

  const currentSeason = useMemo(() => seasonPages?.pages.flat() || [], [seasonPages]);

  const removeCw = useMutation({
    mutationFn: async (showId: string) => {
      await fetch("/api/continue-watching/remove", { method: "POST", body: JSON.stringify({ showId }), headers: { "Content-Type": "application/json" } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['continueWatching'] })
  });

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 800 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div style={{ paddingBottom: '2rem' }}>
    <div style={{
      display: 'flex',
      gap: '2rem',
      padding: isMobile ? '1rem' : '1.5rem',
      alignItems: 'flex-start',
      flexWrap: 'wrap'
    }}>

    {/* Main Content Column */}
    <div style={{ flex: '1', minWidth: '0' }}>

    {cwList && cwList.length > 0 && (
      <AnimeSection
      title="Continue Watching"
      animeList={cwList}
      continueWatching
      onRemove={(id) => removeCw.mutate(id)}
      showSeeMore
      />
    )}

    <AnimeSection title="Latest Releases" animeList={latest || []} loading={loadingLatest} />

    <section>
    <div className="section-title">Current Season</div>
    <div className="grid-container">
    {currentSeason.map(anime => <AnimeCard key={anime._id} anime={anime} />)}
    {(loadingSeason || isFetchingNextPage) && <SkeletonGrid count={6} />}
    </div>
    </section>
    </div>

    {/* Sidebar Column - Only visible on desktop - Natural Scroll (Not Sticky) */}
    {!isMobile && (
      <aside style={{
        width: '320px',
        flexShrink: 0,
        marginTop: '0'
      }}>
      <Top10List title="Top 10 Popular" />
      </aside>
    )}
    </div>

    <Schedule />
    </div>
  );
};

export default Home;
