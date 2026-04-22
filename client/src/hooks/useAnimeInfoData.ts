import { useEffect, useCallback, useReducer, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type { DetailedShowMeta } from '../types/player'
import { playerReducer, initialState, type Action } from '../reducers/playerReducer'

interface UseAnimeInfoDataReturn {
  showMeta: DetailedShowMeta
  allMangaDetails: Record<string, string | number | null> | null
  inWatchlist: boolean
  loadingMeta: boolean
  loadingDetails: boolean
  error: string | null
  toggleWatchlist: () => Promise<void>
  handleToggleDetails: () => Promise<void>
  dispatch: React.Dispatch<Action>
}

export function useAnimeInfoData(showId: string | undefined): UseAnimeInfoDataReturn {
  const [state, dispatch] = useReducer(playerReducer, initialState)
  const latestShowMetaRef = useRef(state.showMeta)

  useEffect(() => {
    latestShowMetaRef.current = state.showMeta
  }, [state.showMeta])

  const {
    data: showData,
    isLoading: loadingMeta,
    error: showDataError,
  } = useQuery({
    queryKey: ['show-data-info', showId],
    queryFn: async () => {
      if (!showId) throw new Error('No showId')
      const [metaResponse, episodesResponse, watchlistResponse] = await Promise.all([
        fetch(`/api/show-meta/${showId}`),
        fetch(`/api/episodes?showId=${showId}&mode=sub`),
        fetch(`/api/watchlist/check/${showId}`),
      ])

      if (!metaResponse.ok) throw new Error('Failed to fetch show metadata')

      const meta = await metaResponse.json()
      const watchlistStatus = watchlistResponse.ok
        ? await watchlistResponse.json()
        : { inWatchlist: false }

      let description = meta?.description
      if (episodesResponse.ok) {
        const episodeData = await episodesResponse.json()
        if (episodeData?.description) {
          description = episodeData.description
        }
      }

      return {
        showMeta: { ...meta, description },
        inWatchlist: watchlistStatus.inWatchlist ?? false,
      }
    },
    enabled: !!showId,
  })

  useEffect(() => {
    if (showData) {
      dispatch({
        type: 'SET_STATE',
        payload: { showMeta: showData.showMeta, inWatchlist: showData.inWatchlist },
      })
    }
  }, [showData])

  useEffect(() => {
    if (showDataError) {
      dispatch({ type: 'SET_ERROR', payload: (showDataError as Error).message })
    }
  }, [showDataError])

  const toggleWatchlist = useCallback(async () => {
    if (!showId || !state.showMeta?.name) return
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
    showMeta: state.showMeta,
    allMangaDetails: state.allMangaDetails,
    inWatchlist: state.inWatchlist,
    loadingMeta,
    loadingDetails: state.loadingDetails,
    error: state.error,
    toggleWatchlist,
    handleToggleDetails,
    dispatch,
  }
}
