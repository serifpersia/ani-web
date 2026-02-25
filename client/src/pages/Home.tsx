import React, { useEffect, useMemo, useRef, useCallback } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import AnimeSection from '../components/anime/AnimeSection'
import Top10List from '../components/anime/Top10List'
import Schedule from '../components/anime/Schedule'
import AnimeCard from '../components/anime/AnimeCard'
import SkeletonGrid from '../components/common/SkeletonGrid'
import { useLatestReleases, useCurrentSeason, useContinueWatching } from '../hooks/useAnimeData'
import useIsMobile from '../hooks/useIsMobile'

const Home: React.FC = () => {
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()
  const isTablet = useIsMobile(1024)
  const observerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.title = 'Home - ani-web'
  }, [])

  const { data: latest, isLoading: loadingLatest } = useLatestReleases()
  const { data: cwList } = useContinueWatching(15)
  const {
    data: seasonPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loadingSeason,
  } = useCurrentSeason()

  const currentSeason = useMemo(() => seasonPages?.pages.flat() || [], [seasonPages])

  const removeCw = useMutation({
    mutationFn: async (showId: string) => {
      await fetch('/api/continue-watching/remove', {
        method: 'POST',
        body: JSON.stringify({ showId }),
        headers: { 'Content-Type': 'application/json' },
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['continueWatching'] }),
  })

  const handleRemove = useCallback(
    (id: string) => {
      removeCw.mutate(id)
    },
    [removeCw]
  )

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1 }
    )

    if (observerRef.current) {
      observer.observe(observerRef.current)
    }

    return () => {
      if (observerRef.current) {
        observer.unobserve(observerRef.current)
      }
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <div style={{ paddingBottom: '2rem' }}>
      <div
        style={{
          display: isTablet ? 'flex' : 'grid',
          gridTemplateColumns: isTablet ? undefined : '1fr 320px',
          flexDirection: isTablet ? 'column' : undefined,
          gap: '2rem',
          padding: isMobile ? '1rem' : '1.5rem',
          alignItems: isTablet ? undefined : 'start',
        }}
      >
        {isTablet && (
          <section>
            <Top10List title="Top 10 Popular" />
          </section>
        )}

        <div style={{ minWidth: '0' }}>
          <div style={{ minHeight: cwList && cwList.length > 0 ? '280px' : '0' }}>
            {cwList && cwList.length > 0 && (
              <AnimeSection
                title="Continue Watching"
                animeList={cwList}
                continueWatching
                onRemove={handleRemove}
                showSeeMore
              />
            )}
          </div>

        </div>

        {!isTablet && (
          <aside>
            <Top10List title="Top 10 Popular" />
          </aside>
        )}

        <section style={{ gridColumn: isTablet ? undefined : '1 / -1' }}>
          <div style={{ minHeight: '800px', marginBottom: '2rem' }}>
            <AnimeSection
              title="Latest Releases"
              animeList={latest || []}
              loading={loadingLatest}
            />
          </div>

          <div className="section-title">Current Season</div>
          <div className="grid-container">
            {currentSeason.map((anime) => (
              <AnimeCard key={anime._id} anime={anime} />
            ))}
            {(loadingSeason || isFetchingNextPage) && <SkeletonGrid count={6} />}
          </div>
          <div ref={observerRef} style={{ height: '20px' }} />
        </section>
      </div>

      <Schedule />
    </div>
  )
}

export default Home
