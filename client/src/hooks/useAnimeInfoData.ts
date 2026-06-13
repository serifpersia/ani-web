import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type { DetailedShowMeta } from '../types/player'
import { fetchApi } from '../lib/fetchApi'

interface UseAnimeInfoDataReturn {
  showMeta: DetailedShowMeta | undefined
  inWatchlist: boolean
  loadingMeta: boolean
  error: string | null
  toggleWatchlist: () => Promise<void>
}

export function useAnimeInfoData(showId: string | undefined): UseAnimeInfoDataReturn {
  const queryClient = useQueryClient()

  const {
    data: showData,
    isLoading: loadingMeta,
    error: showDataError,
  } = useQuery({
    queryKey: ['show-data-info', showId],
    queryFn: async () => {
      if (!showId) throw new Error('No showId')
      const [meta, watchlistStatus, episodeData] = await Promise.all([
        fetchApi(`/api/show-meta/${showId}`),
        fetchApi(`/api/watchlist/check/${showId}`).catch(() => ({ inWatchlist: false })),
        fetchApi(`/api/episodes?showId=${showId}&mode=sub`).catch(() => null),
      ])

      let description = meta?.description
      if (episodeData?.description) {
        description = episodeData.description
      }

      return {
        showMeta: { ...meta, description },
        inWatchlist: watchlistStatus.inWatchlist ?? false,
      }
    },
    enabled: !!showId,
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

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Watchlist update failed')
      return !wasIn
    },
    onMutate: async ({ wasIn }) => {
      await queryClient.cancelQueries({ queryKey: ['show-data-info', showId] })
      const previousData = queryClient.getQueryData(['show-data-info', showId])
      queryClient.setQueryData(
        ['show-data-info', showId],
        (old: { showMeta: DetailedShowMeta; inWatchlist: boolean } | undefined) => {
          if (!old) return old
          return {
            ...old,
            inWatchlist: !wasIn,
          }
        }
      )
      return { previousData }
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['show-data-info', showId], context.previousData)
      }
      toast.error('Failed to update watchlist')
    },
    onSuccess: (newInWatchlist) => {
      toast.success(newInWatchlist ? 'Added to watchlist' : 'Removed from watchlist')
      queryClient.invalidateQueries({ queryKey: ['watchlist'] })
    },
  })

  const toggleWatchlist = useCallback(async () => {
    if (!showId || !showData?.showMeta) return
    await toggleWatchlistMutation({ wasIn: !!showData.inWatchlist, showMeta: showData.showMeta })
  }, [showId, showData, toggleWatchlistMutation])

  return {
    showMeta: showData?.showMeta,
    inWatchlist: !!showData?.inWatchlist,
    loadingMeta,
    error: showDataError ? (showDataError as Error).message : null,
    toggleWatchlist,
  }
}
