import React, { useEffect, useMemo, useCallback, useRef } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { FaHistory, FaChevronLeft, FaChevronRight } from 'react-icons/fa'
import AnimeSection from '../components/anime/AnimeSection'
import Top10List from '../components/anime/Top10List'
import Schedule from '../components/anime/Schedule'
import AnimeCard from '../components/anime/AnimeCard'
import SkeletonGrid from '../components/common/SkeletonGrid'
import RemoveConfirmationModal from '../components/common/RemoveConfirmationModal'
import {
  useLatestReleases,
  usePaginatedCurrentSeason,
  useContinueWatchingFast,
  useContinueWatchingUpNext,
  useRemoveFromWatchlist,
} from '../hooks/useAnimeData'
import { useSetting } from '../hooks/useSettings'
import useIsMobile from '../hooks/useIsMobile'
import { useTitlePreference } from '../contexts/TitlePreferenceContext'

const Home: React.FC = () => {
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()
  const isTablet = useIsMobile(1024)
  const [page, setPage] = React.useState(1)
  const seasonalRef = useRef<HTMLDivElement>(null)

  const { titlePreference } = useTitlePreference()
  const [itemToRemove, setItemToRemove] = React.useState<{ id: string; name: string } | null>(null)
  const { data: skipConfirm } = useSetting('skipRemoveConfirmation')
  const removeWatchlistMutation = useRemoveFromWatchlist()

  useEffect(() => {
    document.title = 'Home - ani-web'
  }, [])

  const { data: latest, isLoading: loadingLatest } = useLatestReleases()
  const { data: cwFast, isLoading: loadingFast } = useContinueWatchingFast(15)
  const { data: cwUpNext, isLoading: loadingUpNext } = useContinueWatchingUpNext()
  const loadingCw = loadingFast || loadingUpNext

  const cwList = useMemo(() => {
    const combined: typeof cwFast = []
    const seen = new Set<string>()

    if (cwUpNext) {
      for (const show of cwUpNext) {
        if (show.nextEpisodeToWatch && !seen.has(show.id)) {
          combined.push(show)
          seen.add(show.id)
        }
      }
    }

    if (cwFast) {
      for (const show of cwFast) {
        if (!seen.has(show.id)) {
          combined.push(show)
          seen.add(show.id)
        }
      }
    }

    if (cwUpNext) {
      for (const show of cwUpNext) {
        if (!show.nextEpisodeToWatch && !seen.has(show.id)) {
          combined.push(show)
          seen.add(show.id)
        }
      }
    }

    return combined.length > 0 ? combined : cwFast || []
  }, [cwFast, cwUpNext])

  const { data: currentSeason, isLoading: loadingSeason } = usePaginatedCurrentSeason(page)

  const removeCw = useMutation({
    mutationFn: async (showId: string) => {
      await fetch('/api/continue-watching/remove', {
        method: 'POST',
        body: JSON.stringify({ showId }),
        headers: { 'Content-Type': 'application/json' },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['continueWatchingFast'] })
      queryClient.invalidateQueries({ queryKey: ['continueWatchingUpNext'] })
    },
  })

  const handleRemove = useCallback(
    (id: string) => {
      const shouldSkip = String(skipConfirm) === 'true' || skipConfirm === 1 || skipConfirm === true
      if (shouldSkip) {
        removeCw.mutate(id)
      } else {
        const show = cwList?.find((s) => String(s.id) === String(id))
        if (show) {
          const displayTitle = (show[titlePreference as keyof typeof show] as string) || show.name
          setItemToRemove({ id, name: displayTitle })
        }
      }
    },
    [removeCw, cwList, titlePreference, skipConfirm]
  )

  const handleConfirmRemove = useCallback(
    (options: { removeFromWatchlist?: boolean }) => {
      if (!itemToRemove) return
      removeCw.mutate(itemToRemove.id)
      if (options.removeFromWatchlist) removeWatchlistMutation.mutate(itemToRemove.id)
      setItemToRemove(null)
    },
    [itemToRemove, removeCw, removeWatchlistMutation]
  )

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
          <AnimeSection
            title="Continue Watching"
            animeList={cwList || []}
            continueWatching
            onRemove={handleRemove}
            showSeeMore={cwList !== undefined && cwList.length > 0}
            loading={loadingFast}
            emptyState={
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4rem 2rem',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-secondary)',
                  textAlign: 'center',
                  gap: '1rem',
                  width: '100%',
                  minHeight: '280px',
                }}
              >
                <FaHistory
                  size={40}
                  style={{ color: 'var(--accent)', opacity: 0.6, marginBottom: '0.5rem' }}
                />
                <div>
                  <h3
                    style={{
                      fontSize: '1.2rem',
                      fontWeight: 'var(--font-weight-semibold)',
                      marginBottom: '0.4rem',
                      color: 'var(--text-primary)',
                    }}
                  >
                    Nothing is here...
                  </h3>
                  <p
                    style={{
                      fontSize: '0.9rem',
                      color: 'var(--text-secondary)',
                      maxWidth: '300px',
                    }}
                  >
                    You haven't watched anything yet. Start exploring and watch something first!
                  </p>
                </div>
              </div>
            }
          />
        </div>

        {!isTablet && (
          <aside>
            <Top10List title="Top 10 Popular" />
          </aside>
        )}

        <section style={{ gridColumn: isTablet ? undefined : '1 / -1' }}>
          <div style={{ marginBottom: '2rem' }}>
            <AnimeSection
              title="Latest Releases"
              animeList={latest || []}
              loading={loadingLatest}
              carousel
            />
          </div>

          <div
            className="section-header"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-6)',
            }}
            ref={seasonalRef}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div className="section-title" style={{ marginBottom: 0 }}>
                Current Season
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center',
                  background: 'var(--bg-secondary)',
                  padding: '4px 8px',
                  borderRadius: '20px',
                  border: '1px solid var(--border-secondary)',
                }}
              >
                <button
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px',
                    opacity: page === 1 ? 0.3 : 1,
                  }}
                  onClick={() => {
                    if (page > 1) {
                      setPage((p) => p - 1)
                      if (seasonalRef.current) {
                        const y =
                          seasonalRef.current.getBoundingClientRect().top + window.scrollY - 80
                        window.scrollTo({ top: y, behavior: 'smooth' })
                      }
                    }
                  }}
                  disabled={page === 1}
                >
                  <FaChevronLeft size={14} />
                </button>
                <span
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 'var(--font-weight-bold)',
                    minWidth: '20px',
                    textAlign: 'center',
                  }}
                >
                  {page}
                </span>
                <button
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px',
                    opacity: !currentSeason || currentSeason.length < 14 ? 0.3 : 1,
                  }}
                  onClick={() => {
                    if (currentSeason && currentSeason.length >= 14) {
                      setPage((p) => p + 1)
                      if (seasonalRef.current) {
                        const y =
                          seasonalRef.current.getBoundingClientRect().top + window.scrollY - 80
                        window.scrollTo({ top: y, behavior: 'smooth' })
                      }
                    }
                  }}
                  disabled={!currentSeason || currentSeason.length < 14}
                >
                  <FaChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>

          <div
            className="grid-container"
            style={{
              minHeight: '300px',
              alignContent: 'start',
              gridTemplateColumns: isTablet ? undefined : 'repeat(7, 1fr)',
            }}
          >
            {loadingSeason ? (
              <SkeletonGrid count={14} />
            ) : (
              currentSeason?.map((anime) => <AnimeCard key={anime._id} anime={anime} />)
            )}
          </div>
        </section>
      </div>

      <Schedule />

      <RemoveConfirmationModal
        isOpen={!!itemToRemove}
        onClose={() => setItemToRemove(null)}
        onConfirm={handleConfirmRemove}
        animeName={itemToRemove?.name || ''}
        scenario="continueWatching"
      />
    </div>
  )
}

export default Home
