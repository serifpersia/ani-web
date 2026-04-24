import { useEffect, useCallback, useReducer, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  episodeNumber: string | undefined
): UsePlayerDataReturn => {
  const [state, dispatch] = useReducer(playerReducer, initialState)
  const latestShowMetaRef = useRef(state.showMeta)

  useEffect(() => {
    latestShowMetaRef.current = state.showMeta
  }, [state.showMeta])

  const {
    data: showData,
    isLoading: loadingShowData,
    error: showDataError,
  } = useQuery({
    queryKey: ['show-data', showId, state.currentMode],
    queryFn: async () => {
      if (!showId) throw new Error('No showId')
      const [metaResponse, episodesResponse, watchlistResponse, watchedResponse] =
        await Promise.all([
          fetch(`/api/show-meta/${showId}`),
          fetch(`/api/episodes?showId=${showId}&mode=${state.currentMode}`),
          fetch(`/api/watchlist/check/${showId}`),
          fetch(`/api/watched-episodes/${showId}`),
        ])

      if (!metaResponse.ok) throw new Error('Failed to fetch show metadata')

      const meta = await metaResponse.json()
      const watchlistStatus = watchlistResponse.ok
        ? await watchlistResponse.json()
        : { inWatchlist: false }
      const watchedData = watchedResponse.ok ? await watchedResponse.json() : []

      let episodes = []
      let description = meta?.description

      if (episodesResponse.ok) {
        const episodeData = await episodesResponse.json()
        if (episodeData) {
          episodes = episodeData.episodes.sort(
            (a: string, b: string) => parseFloat(a) - parseFloat(b)
          )
          description = episodeData.description || description
        }
      }

      return {
        showMeta: {
          ...meta,
          description,
          names: meta?.names || {
            romaji: meta?.name,
            english: meta?.englishName,
            native: meta?.nativeName,
          },
        },
        episodes,
        inWatchlist: watchlistStatus.inWatchlist,
        watchedEpisodes: watchedData,
      }
    },
    enabled: !!showId,
  })

  useEffect(() => {
    if (showData) {
      dispatch({
        type: 'SHOW_DATA_SUCCESS',
        payload: {
          ...showData,
          currentEpisode:
            episodeNumber || (showData.episodes.length > 0 ? showData.episodes[0] : undefined),
        },
      })
    }
  }, [showData, episodeNumber])

  useEffect(() => {
    if (showDataError) {
      dispatch({
        type: 'SET_ERROR',
        payload: showDataError instanceof Error ? showDataError.message : 'Show data load failed',
      })
    }
  }, [showDataError])

  const {
    data: videoData,
    isLoading: loadingVideo,
    error: videoError,
  } = useQuery({
    queryKey: [
      'video-sources',
      showId,
      state.currentEpisode,
      state.selectedProvider,
      state.currentMode,
      state.showMeta?.name,
    ],
    queryFn: async () => {
      if (!showId || !state.currentEpisode) throw new Error('Missing params')

      let providerShowId = showId
      if (
        ['hianime', 'animepahe', '123anime'].includes(state.selectedProvider) &&
        state.showMeta.name
      ) {
        const searchResponse = await fetch(
          `/api/search?query=${encodeURIComponent(state.showMeta.name)}&provider=${state.selectedProvider}`
        )
        const searchResults = await searchResponse.json()
        if (searchResults && searchResults.length > 0) {
          providerShowId = searchResults[0].session || searchResults[0].id
        }
      }

      const [sourcesResponse, progressResponse, preferredSourceResponse, skipTimesResponse] =
        await Promise.all([
          fetch(
            `/api/video?showId=${providerShowId}&episodeNumber=${state.currentEpisode}&mode=${state.currentMode}&provider=${state.selectedProvider}`
          ),
          fetch(`/api/episode-progress/${showId}/${state.currentEpisode}`),
          fetch(`/api/settings?key=preferredSource`),
          fetch(`/api/skip-times/${showId}/${state.currentEpisode}`),
        ])

      if (!sourcesResponse.ok) throw new Error('Failed to fetch video sources')
      const sources: VideoSource[] = await sourcesResponse.json()

      const preferredSourceName = preferredSourceResponse.ok
        ? (await preferredSourceResponse.json()).value
        : null

      let sourceToSelect: VideoSource | null = sources.length > 0 ? sources[0] : null
      if (preferredSourceName) {
        const found = sources.find((s) => s.sourceName === preferredSourceName)
        if (found) sourceToSelect = found
      }

      const selectedLink =
        sourceToSelect && sourceToSelect.links.length > 0
          ? sourceToSelect.links.sort(
              (a: VideoLink, b: VideoLink) =>
                (parseInt(b.resolutionStr) || 0) - (parseInt(a.resolutionStr) || 0)
            )[0]
          : null

      let resumeTime = 0
      let resumeDuration = 0
      let showResumeModal = false
      if (progressResponse.ok) {
        const progress = await progressResponse.json()
        if (progress?.currentTime > 0) {
          resumeTime = progress.currentTime
          resumeDuration = progress.duration || 0
          showResumeModal = true
        }
      }

      const skipResponseData = skipTimesResponse.ok ? await skipTimesResponse.json() : []
      const rawSkips = Array.isArray(skipResponseData)
        ? skipResponseData
        : skipResponseData.results || []

      const skipIntervals: SkipInterval[] = rawSkips
        .map((item: RawSkipInterval) => ({
          skip_id: item.skip_id || '',
          skip_type: item.skip_type || '',
          start_time: item.interval?.start_time ?? item.start_time ?? 0,
          end_time: item.interval?.end_time ?? item.end_time ?? 0,
        }))
        .filter((i: SkipInterval) => i.end_time > 0)

      if (sources.length === 0) {
        toast.error(`No video sources found for ${state.selectedProvider}`)
      }

      return {
        videoSources: sources,
        selectedSource: sourceToSelect,
        selectedLink,
        resumeTime,
        resumeDuration,
        showResumeModal: showResumeModal && resumeTime > 5 && sourceToSelect?.type !== 'iframe',
        skipIntervals,
      }
    },
    enabled: !!showId && !!state.currentEpisode && !loadingShowData,
  })

  useEffect(() => {
    if (videoData) {
      dispatch({ type: 'VIDEO_DATA_SUCCESS', payload: videoData })
    }
  }, [videoData])

  useEffect(() => {
    if (videoError) {
      const message = videoError instanceof Error ? videoError.message : 'Video load failed'
      toast.error(message)
      dispatch({
        type: 'SET_STATE',
        payload: { loadingVideo: false },
      })
    }
  }, [videoError])

  useEffect(() => {
    dispatch({ type: 'SET_LOADING', key: 'loadingShowData', value: loadingShowData })
  }, [loadingShowData])

  useEffect(() => {
    dispatch({ type: 'SET_LOADING', key: 'loadingVideo', value: loadingVideo })
  }, [loadingVideo])

  const { data: detailsData, isLoading: loadingDetails } = useQuery({
    queryKey: ['show-details', showId],
    queryFn: async () => {
      const detailsResponse = await fetch(`/api/show-details/${showId}`)
      if (!detailsResponse.ok) {
        throw new Error('Failed to fetch show details')
      }
      return detailsResponse.json()
    },
    enabled: !!showId && !loadingShowData && !!state.showMeta?.name && !!state.showMeta?.type,
  })

  useEffect(() => {
    dispatch({ type: 'SET_LOADING', key: 'loadingDetails', value: loadingDetails })
  }, [loadingDetails])

  useEffect(() => {
    if (detailsData) {
      const currentShowMeta = latestShowMetaRef.current
      dispatch({
        type: 'SET_STATE',
        payload: {
          showMeta: {
            ...currentShowMeta,
            ...detailsData,
            name: currentShowMeta.name,
          },
          loadingDetails: false,
        },
      })
    }
  }, [detailsData])

  const toggleWatchlist = useCallback(async () => {
    if (!state.showMeta || !showId) return
    const wasIn = state.inWatchlist
    dispatch({ type: 'SET_STATE', payload: { inWatchlist: !wasIn } })

    try {
      const endpoint = wasIn ? '/api/watchlist/remove' : '/api/watchlist/add'
      const payload = {
        id: showId,
        name: state.showMeta.name || state.showMeta.names?.romaji,
        thumbnail: state.showMeta.thumbnail,
        nativeName: state.showMeta.names?.native,
        englishName: state.showMeta.names?.english,
        type: state.showMeta.type,
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Watchlist update failed')
      toast.success(wasIn ? 'Removed from watchlist' : 'Added to watchlist')
    } catch (e) {
      dispatch({ type: 'SET_STATE', payload: { inWatchlist: wasIn } })
      toast.error('Failed to update watchlist')
    }
  }, [showId, state.showMeta, state.inWatchlist])

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

  const handleToggleDetails = useCallback(async () => {
    dispatch({ type: 'SET_STATE', payload: { showCombinedDetails: !state.showCombinedDetails } })
    if (state.showCombinedDetails || state.allMangaDetails) return

    try {
      dispatch({ type: 'SET_LOADING', key: 'loadingDetails', value: true })
      const resp = await fetch(`/api/allmanga-details/${showId}`)
      const data = resp.ok ? await resp.json() : null
      dispatch({ type: 'SET_STATE', payload: { allMangaDetails: data, loadingDetails: false } })
    } catch (e) {
      console.warn(e)
      dispatch({ type: 'SET_LOADING', key: 'loadingDetails', value: false })
    }
  }, [showId, state.showCombinedDetails, state.allMangaDetails])

  return {
    state,
    dispatch,
    toggleWatchlist,
    setPreferredSource,
    handleToggleDetails,
  }
}
