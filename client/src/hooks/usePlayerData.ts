import { useEffect, useCallback, useReducer, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type {
  DetailedShowMeta,
  VideoSource,
  VideoLink,
  SkipInterval,
  PlayerState,
} from '../types/player'
import { playerReducer, createInitialState, type Action } from '../reducers/playerReducer'
import { fetchApi } from '../lib/fetchApi'
import { useShowMeta } from './useShowMeta'

interface UsePlayerDataReturn {
  state: PlayerState
  dispatch: React.Dispatch<Action>
  toggleWatchlist: () => Promise<void>
  moveToCompleted: () => Promise<void>
  setPreferredSource: (sourceName: string) => Promise<void>
  handleToggleDetails: () => Promise<void>
  markEpisodeWatched: (episodeNumber: string, duration: number) => Promise<void>
  isMarkingWatched: boolean
  isUpdatingWatchlistStatus: boolean
}

interface RawSkipInterval {
  skip_id?: string
  skip_type?: string
  interval?: {
    start_time: number
    end_time: number
  }
  start_time?: number
  end_time?: number
}

export const usePlayerData = (
  showId: string | undefined,
  episodeNumber: string | undefined,
  initialMeta?: Record<string, unknown> | null
): UsePlayerDataReturn => {
  const [uiState, dispatch] = useReducer(playerReducer, initialMeta, (meta) => ({
    ...createInitialState(),
    showMeta: meta?.name
      ? {
          name: meta.name as string,
          thumbnail: meta.thumbnail as string,
          nativeName: meta.nativeName as string,
          englishName: meta.englishName as string,
          names: {
            romaji: (meta.englishName as string) || (meta.name as string),
            english: (meta.englishName as string) || (meta.name as string),
            native: meta.nativeName as string,
          },
        }
      : {},
  }))
  const queryClient = useQueryClient()
  const hasForcedProvider = useRef<string | null>(null)
  const hasForcedAdultProvider = useRef<string | null>(null)

  const currentEpisode = episodeNumber || uiState.initialEpisode

  useEffect(() => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (
      showId &&
      UUID_RE.test(showId) &&
      uiState.selectedProvider !== 'animepahe' &&
      hasForcedProvider.current !== showId
    ) {
      hasForcedProvider.current = showId
      dispatch({ type: 'SET_PROVIDER', payload: 'animepahe' })
    }
  }, [showId, uiState.selectedProvider])

  const { data: showMeta, isLoading: loadingShowData, error: showDataError } = useShowMeta(showId)

  const { data: playerData } = useQuery({
    queryKey: ['player-data', showId, uiState.currentMode],
    queryFn: async () => {
      if (!showId) throw new Error('No showId')

      const showTitle = (showMeta?.name as string) || (showMeta?.englishName as string) || ''

      const fetchEpisodes = async (): Promise<{
        episodes: string[]
        description?: string
      } | null> => {
        if (uiState.selectedProvider === 'animepahe') {
          try {
            let url = `/api/episodes?showId=${showId}&mode=${uiState.currentMode}&provider=animepahe`
            if (showTitle) url += `&title=${encodeURIComponent(showTitle)}`
            const data = await fetchApi(url)
            if (data?.episodes?.length) return data
          } catch {
            // ignore
          }
        }
        try {
          let url = `/api/episodes?showId=${showId}&mode=${uiState.currentMode}`
          if (showTitle) url += `&title=${encodeURIComponent(showTitle)}`
          const data = await fetchApi(url)
          if (data?.episodes?.length) return data
        } catch {
          // ignore
        }
        return null
      }

      const [episodeData, watchlistStatus, watchedEpisodes] = await Promise.all([
        fetchEpisodes(),
        fetchApi(`/api/watchlist/check/${showId}`).catch(() => ({ inWatchlist: false })),
        fetchApi(`/api/watched-episodes/${showId}`).catch(() => []),
      ])

      const episodes = episodeData?.episodes
        ? episodeData.episodes.sort((a: string, b: string) => parseFloat(a) - parseFloat(b))
        : []

      return {
        description: episodeData?.description || '',
        episodes,
        inWatchlist: watchlistStatus.inWatchlist,
        watchlistStatus: watchlistStatus.status ?? null,
        watchedEpisodes,
      }
    },
    enabled: !!showId,
  })

  useEffect(() => {
    if (
      !episodeNumber &&
      playerData?.episodes &&
      playerData.episodes.length > 0 &&
      !episodeNumber
    ) {
      dispatch({ type: 'SET_STATE', payload: { initialEpisode: playerData.episodes[0] } })
    }
  }, [playerData, episodeNumber])

  useEffect(() => {
    if (
      showMeta?.isAdult &&
      uiState.selectedProvider !== 'wh' &&
      hasForcedAdultProvider.current !== showId
    ) {
      hasForcedAdultProvider.current = showId
      dispatch({ type: 'SET_PROVIDER', payload: 'wh' })
    }
  }, [showMeta?.isAdult, uiState.selectedProvider, showId])

  const {
    data: videoData,
    isLoading: loadingVideo,
    error: videoError,
  } = useQuery({
    queryKey: [
      'video-sources',
      showId,
      currentEpisode,
      uiState.selectedProvider,
      uiState.currentMode,
      showMeta?.name,
    ],
    queryFn: async () => {
      if (!showId || !currentEpisode) throw new Error('Missing params')

      try {
        let providerShowId = showId
        if (
          ['allanime', '123anime', 'animeya', 'megaplay', 'wh'].includes(uiState.selectedProvider)
        ) {
          const names = showMeta?.names
          // AlAnime's `name` field is often the native Japanese script (e.g. "ブリーチ"
          // for Bleach), which gets mapped to names.romaji. Sending katakana/kanji to
          // other providers causes them to search for the transliteration ("Burichi")
          // and return no results. Guard against this by only using romaji when it is
          // pure ASCII, otherwise fall back to the English name.
          const isAscii = (s: string) => {
            for (let i = 0; i < s.length; i++) {
              if (s.charCodeAt(i) > 127) return false
            }
            return true
          }
          const romajiName = names?.romaji && isAscii(names.romaji) ? names.romaji : null
          const englishName = names?.english || showMeta?.englishName || showMeta?.name
          const searchQuery =
            uiState.currentMode === 'dub' ? englishName || romajiName : romajiName || englishName

          if (searchQuery) {
            let searchResults
            try {
              searchResults = await fetchApi(
                `/api/search?query=${encodeURIComponent(searchQuery)}&provider=${uiState.selectedProvider}`
              )
            } catch {
              searchResults = []
            }
            if (searchResults && searchResults.length > 0) {
              interface SearchResult {
                id: string
                session?: string
                name?: string
                title?: string
                _id?: string
              }
              // Score each result by title closeness to the search query AND
              // whether it matches the current sub/dub mode.
              // Scoring:
              //   +4  exact title match (case-insensitive)
              //   +2  title starts with query
              //   +1  title contains query
              //   +0  id starts with normalised query slug
              //   -10 wrong mode (dub result when sub wanted, or vice versa)
              const qLower = (searchQuery as string).toLowerCase().trim()
              const toSlug = (s: string) =>
                s
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-+|-+$/g, '')
              const qSlug = toSlug(qLower)

              let bestMatch: SearchResult = searchResults[0]
              let bestScore = -Infinity

              for (const s of searchResults as SearchResult[]) {
                const title = (s.name || s.title || '').toLowerCase().trim()
                const sid = (s.id || '').toLowerCase()
                const isDubResult =
                  title.includes('(dub)') || title.endsWith(' dub') || sid.endsWith('-dub')
                const wantDub = uiState.currentMode === 'dub'

                let score = 0
                if (title === qLower) score += 4
                else if (title.startsWith(qLower)) score += 2
                else if (title.includes(qLower)) score += 1
                else if (sid.startsWith(qSlug)) score += 0

                // Heavy penalty for wrong mode so a correct-mode partial match
                // beats an exact wrong-mode match
                if (isDubResult !== wantDub) score -= 10

                if (score > bestScore) {
                  bestScore = score
                  bestMatch = s
                }
              }

              providerShowId = bestMatch.session || bestMatch.id || bestMatch._id
            }
          }
        } else if (uiState.selectedProvider === 'animepahe') {
          const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          if (!UUID_RE.test(showId)) {
            const searchQueries = [
              showMeta?.name || showId,
              showMeta?.englishName || showMeta?.names?.english || '',
            ].filter(Boolean)

            let bestScore = -Infinity
            let bestResult: { id?: string; session?: string; name?: string } = {}

            for (const searchQuery of searchQueries) {
              let searchResults: Array<{
                id?: string
                session?: string
                name?: string
                englishName?: string
              }> = []
              try {
                searchResults = await fetchApi(
                  `/api/search?query=${encodeURIComponent(searchQuery)}&provider=animepahe`
                )
              } catch {
                searchResults = []
              }
              const queryWords = new Set(
                searchQuery
                  .toLowerCase()
                  .split(/\s+/)
                  .filter((w) => w.length >= 2)
              )
              for (const r of searchResults) {
                const name = (r.name || r.englishName || '').toLowerCase()
                const overlap = name.split(/\s+/).filter((w) => queryWords.has(w)).length
                if (overlap > bestScore) {
                  bestScore = overlap
                  bestResult = r
                }
              }
              if (bestScore >= 3) break
            }

            providerShowId = bestResult.session || bestResult.id || ''
          } else {
            providerShowId = showId
          }
        }

        const [sources, progress, preferredSourceData, skipTimesData] = await Promise.all([
          fetchApi(
            `/api/video?showId=${providerShowId}&episodeNumber=${currentEpisode}&mode=${uiState.currentMode}&provider=${uiState.selectedProvider}`
          ).catch(() => null),
          fetchApi(`/api/episode-progress/${showId}/${currentEpisode}`).catch(() => null),
          fetchApi(`/api/settings?key=preferredSource`).catch(() => null),
          fetchApi(
            `/api/skip-times/${showId}/${currentEpisode}?provider=${uiState.selectedProvider}`
          ).catch(() => []),
        ])

        const preferredSourceName = preferredSourceData?.value

        const modeMatchedSources =
          (sources as VideoSource[] | null)?.filter((s) => {
            const name = s.sourceName.toLowerCase()
            if (uiState.currentMode === 'dub') {
              return name.includes('eng') || name.includes('dub')
            } else {
              return (
                name.includes('jpn') ||
                name.includes('sub') ||
                (!name.includes('eng') && !name.includes('dub'))
              )
            }
          }) ?? []

        const pool =
          modeMatchedSources.length > 0
            ? modeMatchedSources
            : ((sources as VideoSource[] | null) ?? [])
        let sourceToSelect: VideoSource | null = pool.length > 0 ? pool[0] : null

        if (preferredSourceName) {
          const found = pool.find((s: VideoSource) => s.sourceName === preferredSourceName)
          if (found) sourceToSelect = found
        }

        const selectedLink =
          sourceToSelect && sourceToSelect.links.length > 0
            ? sourceToSelect.links.sort(
                (a: VideoLink, b: VideoLink) =>
                  (parseInt(b.resolutionStr) || 0) - (parseInt(a.resolutionStr) || 0)
              )[0]
            : null

        const resumeTime = progress?.currentTime || 0
        const resumeDuration = progress?.duration || 0
        const rawSkips = Array.isArray(skipTimesData) ? skipTimesData : skipTimesData?.results || []

        const skipIntervals: SkipInterval[] = rawSkips
          .map((item: RawSkipInterval) => ({
            skip_id: item.skip_id || '',
            skip_type: item.skip_type || '',
            start_time: item.interval?.start_time ?? item.start_time ?? 0,
            end_time: item.interval?.end_time ?? item.end_time ?? 0,
          }))
          .filter((i: SkipInterval) => i.end_time > 0)

        if (!sources || sources.length === 0) {
          toast.error(`No video sources found for ${uiState.selectedProvider}`)
        }

        return {
          videoSources: sources as VideoSource[],
          selectedSource: sourceToSelect,
          selectedLink,
          resumeTime,
          resumeDuration,
          showResumeModal: resumeTime > 5 && sourceToSelect?.type !== 'iframe',
          skipIntervals,
          fetchedEpisodeNumber: currentEpisode,
        }
      } catch (e) {
        const error = e as Error & { provider?: string }
        if (error.message === 'AUTH_REQUIRED') {
          dispatch({
            type: 'SET_STATE',
            payload: { showCookieModal: true, cookieProvider: error.provider },
          })
          return {
            videoSources: [],
            selectedSource: null,
            selectedLink: null,
            resumeTime: 0,
            resumeDuration: 0,
            showResumeModal: false,
            skipIntervals: [],
            fetchedEpisodeNumber: currentEpisode,
          }
        }
        throw e
      }
    },
    enabled: !!showId && !!currentEpisode && !!showMeta,
  })

  const loadingDetails = false

  const { mutateAsync: toggleWatchlistMutation } = useMutation({
    mutationFn: async ({ wasIn, showMeta }: { wasIn: boolean; showMeta: DetailedShowMeta }) => {
      const endpoint = wasIn ? '/api/watchlist/remove' : '/api/watchlist/add'
      const payload = {
        id: showId,
        name: showMeta.name || showMeta.names?.romaji,
        thumbnail: showMeta.thumbnail,
        nativeName: showMeta.names?.native,
        englishName: showMeta.names?.english,
        type: showMeta.type,
      }
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return !wasIn
    },
    onSuccess: (newInWatchlist) => {
      toast.success(newInWatchlist ? 'Added to watchlist' : 'Removed from watchlist')
      queryClient.invalidateQueries({ queryKey: ['show-data', showId] })
      queryClient.invalidateQueries({ queryKey: ['watchlist'] })
    },
    onError: () => toast.error('Failed to update watchlist'),
  })

  const toggleWatchlist = useCallback(async () => {
    if (!showId || !showMeta) return
    await toggleWatchlistMutation({
      wasIn: !!playerData?.inWatchlist,
      showMeta: showMeta as DetailedShowMeta,
    })
  }, [showId, showMeta, playerData?.inWatchlist, toggleWatchlistMutation])

  const setPreferredSource = useCallback(async (sourceName: string) => {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'preferredSource', value: sourceName }),
      })
    } catch (e) {
      console.error(e)
    }
  }, [])

  const { mutateAsync: updateWatchlistStatusMutation, isPending: isUpdatingWatchlistStatus } =
    useMutation({
      mutationFn: async ({ status }: { status: string }) => {
        if (!showId) throw new Error('Missing showId')

        const response = await fetch('/api/watchlist/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: showId, status }),
        })

        if (!response.ok) {
          throw new Error('Failed to update watchlist status')
        }

        return status
      },
      onSuccess: (status) => {
        dispatch({ type: 'SET_STATE', payload: { inWatchlist: true, watchlistStatus: status } })
        toast.success(`Moved to ${status}`)
        queryClient.invalidateQueries({ queryKey: ['show-data', showId] })
        queryClient.invalidateQueries({ queryKey: ['watchlist'] })
        queryClient.invalidateQueries({ queryKey: ['continueWatchingFast'] })
        queryClient.invalidateQueries({ queryKey: ['continueWatchingUpNext'] })
        queryClient.invalidateQueries({ queryKey: ['allContinueWatching'] })
      },
      onError: () => toast.error('Failed to update watchlist status'),
    })

  const moveToCompleted = useCallback(async () => {
    await updateWatchlistStatusMutation({ status: 'Completed' })
  }, [updateWatchlistStatusMutation])

  const { mutateAsync: markEpisodeWatchedMutation } = useMutation({
    mutationFn: async ({
      episodeNumber,
      duration,
      showMeta,
      episodes,
    }: {
      episodeNumber: string
      duration: number
      showMeta: DetailedShowMeta
      episodes: string[]
    }) => {
      await fetch('/api/update-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showId,
          episodeNumber,
          currentTime: duration,
          duration: duration,
          showName: showMeta.name,
          showThumbnail: showMeta.thumbnail,
          nativeName: showMeta.names?.native,
          englishName: showMeta.names?.english,
          genres: showMeta.genres?.map((genre) => genre.name),
          popularityScore: showMeta.score ?? showMeta.stats?.averageScore,
          type: showMeta.type,
          status: showMeta.status,
          episodeCount: episodes.length,
          isAdult: showMeta.isAdult,
        }),
        keepalive: true,
      })
    },
    onSuccess: (data, variables) => {
      toast.success(`Episode ${variables.episodeNumber} marked as watched`)
      queryClient.invalidateQueries({ queryKey: ['player-data', showId] })
      queryClient.invalidateQueries({ queryKey: ['show-meta', showId] })
      queryClient.invalidateQueries({
        queryKey: ['video-sources', showId, variables.episodeNumber],
      })
      queryClient.invalidateQueries({ queryKey: ['continueWatchingFast'] })
      queryClient.invalidateQueries({ queryKey: ['continueWatchingUpNext'] })
    },
    onError: () => toast.error('Failed to mark episode as watched'),
  })

  const markEpisodeWatched = useCallback(
    async (episodeNumber: string, duration: number) => {
      if (!showId || !showMeta) return
      await markEpisodeWatchedMutation({
        episodeNumber,
        duration,
        showMeta: showMeta as DetailedShowMeta,
        episodes: playerData?.episodes || [],
      })
    },
    [showId, showMeta, playerData?.episodes, markEpisodeWatchedMutation]
  )

  const handleToggleDetails = useCallback(async () => {
    dispatch({ type: 'SET_STATE', payload: { showCombinedDetails: !uiState.showCombinedDetails } })
  }, [uiState.showCombinedDetails])

  // DERIVED STATE
  const state = useMemo(() => {
    const error = showDataError || videoError
    const errorMessage = error ? (error as Error).message : null
    const finalError = errorMessage === 'AUTH_REQUIRED' ? null : errorMessage

    return {
      ...uiState,
      currentEpisode,
      showMeta: {
        ...(uiState.showMeta || {}),
        ...(showMeta || {}),
      },
      episodes: playerData?.episodes || [],
      watchedEpisodes: playerData?.watchedEpisodes || [],
      inWatchlist: !!playerData?.inWatchlist,
      watchlistStatus: playerData?.watchlistStatus ?? uiState.watchlistStatus ?? null,
      videoSources: videoData?.videoSources || [],
      selectedSource: uiState.selectedSource || videoData?.selectedSource || null,
      selectedLink: uiState.selectedLink || videoData?.selectedLink || null,
      resumeTime: videoData?.resumeTime || 0,
      resumeDuration: videoData?.resumeDuration || 0,
      showResumeModal: uiState.showResumeModal && (videoData?.showResumeModal ?? false),
      skipIntervals: videoData?.skipIntervals || [],
      loadingShowData,
      loadingVideo,
      loadingDetails,
      error: finalError,
      fetchedEpisodeNumber: videoData?.fetchedEpisodeNumber,
    }
  }, [
    uiState,
    showMeta,
    playerData,
    videoData,
    loadingShowData,
    loadingVideo,
    loadingDetails,
    showDataError,
    videoError,
    currentEpisode,
  ])

  return {
    state: state as PlayerState,
    dispatch,
    toggleWatchlist,
    moveToCompleted,
    setPreferredSource,
    handleToggleDetails,
    markEpisodeWatched,
    isMarkingWatched: markEpisodeWatchedMutation.isPending,
    isUpdatingWatchlistStatus,
  }
}
