import { useEffect, useCallback, useReducer, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type {
  DetailedShowMeta,
  VideoSource,
  VideoLink,
  SkipInterval,
  PlayerState,
} from '../types/player'
import { playerReducer, initialState, type Action } from '../reducers/playerReducer'

interface UsePlayerDataReturn {
  state: PlayerState
  dispatch: React.Dispatch<Action>
  toggleWatchlist: () => Promise<void>
  setPreferredSource: (sourceName: string) => Promise<void>
  handleToggleDetails: () => Promise<void>
  markEpisodeWatched: (episodeNumber: string, duration: number) => Promise<void>
  isMarkingWatched: boolean
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

const fetchApi = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}`)
  return response.json()
}

export const usePlayerData = (
  showId: string | undefined,
  episodeNumber: string | undefined
): UsePlayerDataReturn => {
  const [uiState, dispatch] = useReducer(playerReducer, initialState)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (episodeNumber && episodeNumber !== uiState.currentEpisode) {
      dispatch({ type: 'SET_CURRENT_EPISODE', payload: episodeNumber })
      dispatch({
        type: 'SET_STATE',
        payload: { selectedSource: null, selectedLink: null, showResumeModal: true },
      })
    }
  }, [episodeNumber, uiState.currentEpisode])

  const {
    data: showData,
    isLoading: loadingShowData,
    error: showDataError,
  } = useQuery({
    queryKey: ['show-data', showId, uiState.currentMode],
    queryFn: async () => {
      if (!showId) throw new Error('No showId')
      const [meta, episodeData, watchlistStatus, watchedEpisodes] = await Promise.all([
        fetchApi(`/api/show-meta/${showId}`),
        fetchApi(`/api/episodes?showId=${showId}&mode=${uiState.currentMode}`).catch(() => null),
        fetchApi(`/api/watchlist/check/${showId}`).catch(() => ({ inWatchlist: false })),
        fetchApi(`/api/watched-episodes/${showId}`).catch(() => []),
      ])

      const episodes = episodeData?.episodes
        ? episodeData.episodes.sort((a: string, b: string) => parseFloat(a) - parseFloat(b))
        : []

      return {
        showMeta: {
          ...meta,
          description: episodeData?.description || meta?.description,
          names: meta?.names || {
            romaji: meta?.name,
            english: meta?.englishName,
            native: meta?.nativeName,
          },
        },
        episodes,
        inWatchlist: watchlistStatus.inWatchlist,
        watchedEpisodes,
      }
    },
    enabled: !!showId,
  })

  useEffect(() => {
    if (
      !episodeNumber &&
      showData?.episodes &&
      showData.episodes.length > 0 &&
      !uiState.currentEpisode
    ) {
      dispatch({ type: 'SET_CURRENT_EPISODE', payload: showData.episodes[0] })
    }
  }, [showData, episodeNumber, uiState.currentEpisode])

  const {
    data: videoData,
    isLoading: loadingVideo,
    error: videoError,
  } = useQuery({
    queryKey: [
      'video-sources',
      showId,
      uiState.currentEpisode,
      uiState.selectedProvider,
      uiState.currentMode,
      showData?.showMeta?.name,
    ],
    queryFn: async () => {
      if (!showId || !uiState.currentEpisode) throw new Error('Missing params')

      let providerShowId = showId
      if (['animepahe', '123anime'].includes(uiState.selectedProvider)) {
        const names = showData?.showMeta?.names
        const searchQuery =
          uiState.currentMode === 'dub'
            ? names?.english || showData?.showMeta?.name
            : names?.romaji || showData?.showMeta?.name

        if (searchQuery) {
          const searchResults = await fetchApi(
            `/api/search?query=${encodeURIComponent(searchQuery)}&provider=${uiState.selectedProvider}`
          )
          if (searchResults && searchResults.length > 0) {
            interface SearchResult {
              id: string
              session?: string
              name?: string
              title?: string
            }
            // Prefer results that match the current mode in their title
            const filtered = (searchResults as SearchResult[]).find((s) => {
              const title = (s.name || s.title || '').toLowerCase()
              if (uiState.currentMode === 'dub') {
                return title.includes('dub')
              } else {
                return !title.includes('dub') || title.includes('sub')
              }
            })
            const match = filtered || searchResults[0]
            providerShowId = match.session || match.id
          }
        }
      }

      const [sources, progress, preferredSourceData, skipTimesData] = await Promise.all([
        fetchApi(
          `/api/video?showId=${providerShowId}&episodeNumber=${uiState.currentEpisode}&mode=${uiState.currentMode}&provider=${uiState.selectedProvider}`
        ),
        fetchApi(`/api/episode-progress/${showId}/${uiState.currentEpisode}`).catch(() => null),
        fetchApi(`/api/settings?key=preferredSource`).catch(() => null),
        fetchApi(`/api/skip-times/${showId}/${uiState.currentEpisode}`).catch(() => []),
      ])

      const preferredSourceName = preferredSourceData?.value

      const modeMatchedSources = (sources as VideoSource[]).filter((s) => {
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
      })

      const pool = modeMatchedSources.length > 0 ? modeMatchedSources : (sources as VideoSource[])
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
      const rawSkips = Array.isArray(skipTimesData) ? skipTimesData : skipTimesData.results || []

      const skipIntervals: SkipInterval[] = rawSkips
        .map((item: RawSkipInterval) => ({
          skip_id: item.skip_id || '',
          skip_type: item.skip_type || '',
          start_time: item.interval?.start_time ?? item.start_time ?? 0,
          end_time: item.interval?.end_time ?? item.end_time ?? 0,
        }))
        .filter((i: SkipInterval) => i.end_time > 0)

      if (sources.length === 0) {
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
      }
    },
    enabled: !!showId && !!uiState.currentEpisode && !!showData?.showMeta?.name,
  })

  // 3. Additional Details Query
  const { data: detailsData, isLoading: loadingDetails } = useQuery({
    queryKey: ['show-details', showId],
    queryFn: () => fetchApi(`/api/show-details/${showId}`),
    enabled: !!showId && !!showData?.showMeta?.name,
  })

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
    if (!showId || !showData?.showMeta) return
    await toggleWatchlistMutation({ wasIn: !!showData.inWatchlist, showMeta: showData.showMeta })
  }, [showId, showData, toggleWatchlistMutation])

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
        }),
      })
    },
    onSuccess: (data, variables) => {
      toast.success(`Episode ${variables.episodeNumber} marked as watched`)
      queryClient.invalidateQueries({ queryKey: ['show-data', showId] })
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
      if (!showId || !showData?.showMeta) return
      await markEpisodeWatchedMutation({
        episodeNumber,
        duration,
        showMeta: showData.showMeta,
        episodes: showData.episodes,
      })
    },
    [showId, showData, markEpisodeWatchedMutation]
  )

  const handleToggleDetails = useCallback(async () => {
    dispatch({ type: 'SET_STATE', payload: { showCombinedDetails: !uiState.showCombinedDetails } })
    if (uiState.showCombinedDetails || uiState.allMangaDetails) return

    try {
      const data = await fetchApi(`/api/allmanga-details/${showId}`)
      dispatch({ type: 'SET_STATE', payload: { allMangaDetails: data } })
    } catch (e) {
      console.warn(e)
    }
  }, [showId, uiState.showCombinedDetails, uiState.allMangaDetails])

  // DERIVED STATE
  const state = useMemo(() => {
    const error = showDataError || videoError
    return {
      ...uiState,
      showMeta: {
        ...(showData?.showMeta || {}),
        ...(detailsData || {}),
        name: showData?.showMeta?.name, // Preserve original name
      },
      episodes: showData?.episodes || [],
      watchedEpisodes: showData?.watchedEpisodes || [],
      inWatchlist: !!showData?.inWatchlist,
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
      error: error ? (error as Error).message : null,
    }
  }, [
    uiState,
    showData,
    videoData,
    detailsData,
    loadingShowData,
    loadingVideo,
    loadingDetails,
    showDataError,
    videoError,
  ])

  return {
    state: state as PlayerState,
    dispatch,
    toggleWatchlist,
    setPreferredSource,
    handleToggleDetails,
    markEpisodeWatched,
    isMarkingWatched: markEpisodeWatchedMutation.isPending,
  }
}
