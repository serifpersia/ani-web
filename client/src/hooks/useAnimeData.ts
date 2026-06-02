import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

export interface Anime {
  _id: string
  id: string
  name: string
  nativeName?: string
  englishName?: string
  thumbnail: string
  type?: string
  status?: string
  episodeNumber?: number
  currentTime?: number
  duration?: number
  watchedCount?: number
  nextEpisodeToWatch?: string
  availableEpisodesDetail?: {
    sub?: string[]
    dub?: string[]
  }
  episodeCount?: number
  isAdult?: boolean
  rating?: string
}

export interface QueueItem {
  id: number
  _id: string
  showId: string
  episodeNumber: string
  queue_order: number
  name?: string
  nativeName?: string
  englishName?: string
  thumbnail?: string
  type?: string
}

const fetchApi = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch from ${url}`)
  }
  return response.json()
}

export const usePopularAnime = (timeframe: string) => {
  return useQuery<Anime[]>({
    queryKey: ['popular', timeframe],
    queryFn: () => fetchApi(`/api/popular/${timeframe}`),
  })
}

export const usePaginatedPopularAnime = (timeframe: string, page: number, size: number = 7) => {
  return useQuery<Anime[]>({
    queryKey: ['popular', timeframe, page, size],
    queryFn: () => fetchApi(`/api/popular/${timeframe}?page=${page}&size=${size}`),
  })
}

export const useInfinitePopularAnime = (timeframe: string, size: number = 7) => {
  return useInfiniteQuery<Anime[]>({
    queryKey: ['popularInfinite', timeframe, size],
    queryFn: ({ pageParam = 1 }) =>
      fetchApi(`/api/popular/${timeframe}?page=${pageParam as number}&size=${size}`),
    initialPageParam: 1,
    getNextPageParam: (lastPage: Anime[], allPages) => {
      return lastPage.length >= size ? allPages.length + 1 : undefined
    },
  })
}

export const useLatestReleases = () => {
  return useQuery<Anime[]>({
    queryKey: ['latestReleases'],
    queryFn: () => fetchApi('/api/latest-releases'),
  })
}

export const useInfiniteLatestReleases = (size: number = 14) => {
  return useInfiniteQuery<Anime[]>({
    queryKey: ['latestReleasesInfinite', size],
    queryFn: ({ pageParam = 1 }) =>
      fetchApi(`/api/latest-releases?page=${pageParam as number}&size=${size}`),
    initialPageParam: 1,
    getNextPageParam: (lastPage: Anime[], allPages) => {
      return lastPage.length >= size ? allPages.length + 1 : undefined
    },
  })
}

export const useCurrentSeason = () => {
  return useInfiniteQuery({
    queryKey: ['currentSeason'],
    queryFn: ({ pageParam = 1 }) => fetchApi(`/api/seasonal?page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: (lastPage: Anime[], allPages) => {
      return lastPage.length > 0 ? allPages.length + 1 : undefined
    },
  })
}

export const usePaginatedCurrentSeason = (page: number) => {
  return useQuery<Anime[]>({
    queryKey: ['currentSeason', page],
    queryFn: () => fetchApi(`/api/seasonal?page=${page}`),
  })
}

export const usePaginatedSearchAnime = (
  searchQueryString: string,
  page: number,
  limit: number = 14
) => {
  return useQuery<Anime[]>({
    queryKey: ['searchAnime', searchQueryString, page, limit],
    queryFn: async () => {
      const params = new URLSearchParams(searchQueryString)
      params.set('page', page.toString())
      params.set('limit', limit.toString())
      return fetchApi(`/api/search?${params.toString()}`)
    },
    enabled: searchQueryString != null,
  })
}

export const useContinueWatchingFast = (limit?: number) => {
  const url = limit ? `/api/continue-watching/fast?limit=${limit}` : '/api/continue-watching/fast'
  return useQuery<Anime[]>({
    queryKey: ['continueWatchingFast', { limit }],
    queryFn: () => fetchApi(url),
  })
}

export const useContinueWatchingUpNext = () => {
  const url = '/api/continue-watching/up-next'
  return useQuery<Anime[]>({
    queryKey: ['continueWatchingUpNext'],
    queryFn: () => fetchApi(url),
  })
}

export const useContinueWatching = (limit?: number) => {
  const url = limit ? `/api/continue-watching?limit=${limit}` : '/api/continue-watching'
  return useQuery<Anime[]>({
    queryKey: ['continueWatching', { limit }],
    queryFn: () => fetchApi(url),
  })
}

export const useQueue = () => {
  return useQuery<QueueItem[]>({
    queryKey: ['queue'],
    queryFn: () => fetchApi('/api/queue'),
  })
}

export const useAddToQueue = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (item: {
      showId: string
      episodeNumber: string
      showName?: string
      showThumbnail?: string
      nativeName?: string
      englishName?: string
      type?: string
    }) => {
      const response = await fetch('/api/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      })
      if (!response.ok) throw new Error('Failed to update queue')
      return response.json() as Promise<{ success: boolean; queued: boolean }>
    },
    onSuccess: (data) => {
      if (data.queued) {
        toast.success('Added to queue')
      } else {
        toast.success('Removed from queue')
      }
      queryClient.invalidateQueries({ queryKey: ['queue'] })
    },
    onError: (error: Error) => {
      toast.error(`Failed to update queue: ${error.message}`)
    },
  })
}

export const useRemoveFromQueue = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (item: { showId: string; episodeNumber: string }) => {
      const response = await fetch('/api/queue/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      })
      if (!response.ok) throw new Error('Failed to remove queue item')
    },
    onSuccess: () => {
      toast.success('Removed from queue')
      queryClient.invalidateQueries({ queryKey: ['queue'] })
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove: ${error.message}`)
    },
  })
}

export const useClearQueue = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/queue/clear', { method: 'POST' })
      if (!response.ok) throw new Error('Failed to clear queue')
    },
    onSuccess: () => {
      toast.success('Queue cleared')
      queryClient.invalidateQueries({ queryKey: ['queue'] })
    },
    onError: (error: Error) => {
      toast.error(`Failed to clear queue: ${error.message}`)
    },
  })
}

export const useReorderQueue = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (items: Pick<QueueItem, 'id' | 'showId' | 'episodeNumber'>[]) => {
      const response = await fetch('/api/queue/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      if (!response.ok) throw new Error('Failed to reorder queue')
    },
    onMutate: async (items) => {
      await queryClient.cancelQueries({ queryKey: ['queue'] })
      const previousQueue = queryClient.getQueryData<QueueItem[]>(['queue'])
      queryClient.setQueryData<QueueItem[]>(['queue'], (old) => {
        if (!old) return old
        const byId = new Map(old.map((item) => [item.id, item]))
        return items
          .map((item, index) => {
            const existing = byId.get(item.id)
            return existing ? { ...existing, queue_order: index } : undefined
          })
          .filter((item): item is QueueItem => !!item)
      })
      return { previousQueue }
    },
    onError: (_error, _items, context) => {
      if (context?.previousQueue) queryClient.setQueryData(['queue'], context.previousQueue)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] })
    },
  })
}

interface PaginatedAnimeResponse {
  data: Anime[]
  total: number
  page: number
  limit: number
}

export const useInfiniteWatchlist = (status: string, filters: string = '') => {
  return useInfiniteQuery<PaginatedAnimeResponse, Error, { pages: Anime[]; pageParams: unknown[] }>(
    {
      queryKey: ['watchlist', status, filters],
      queryFn: async ({ pageParam = 1 }) => {
        const params = new URLSearchParams(filters)
        params.set('status', status)
        params.set('page', String(pageParam))
        params.set('limit', '14')
        const response = await fetchApi(`/api/watchlist?${params.toString()}`)
        return response
      },
      initialPageParam: 1,
      getNextPageParam: (lastPage) => {
        if (lastPage.data.length === 0 || lastPage.page * lastPage.limit >= lastPage.total) {
          return undefined
        }
        return lastPage.page + 1
      },
      select: (data) => ({
        ...data,
        pages: data.pages.flatMap((page) => page.data),
      }),
    }
  )
}

export const usePaginatedWatchlist = (
  status: string,
  filters: string = '',
  page: number,
  limit: number = 14
) => {
  return useQuery<PaginatedAnimeResponse>({
    queryKey: ['watchlist', status, filters, page, limit],
    queryFn: async () => {
      const params = new URLSearchParams(filters)
      params.set('status', status)
      params.set('page', String(page))
      params.set('limit', String(limit))
      return fetchApi(`/api/watchlist?${params.toString()}`)
    },
  })
}

export const useAllContinueWatching = (filters: string = '') => {
  return useInfiniteQuery<PaginatedAnimeResponse, Error, { pages: Anime[]; pageParams: unknown[] }>(
    {
      queryKey: ['allContinueWatching', filters],
      queryFn: async ({ pageParam = 1 }) => {
        const params = new URLSearchParams(filters)
        params.set('page', String(pageParam))
        params.set('limit', '14')
        const response = await fetchApi(`/api/continue-watching/all?${params.toString()}`)
        return response
      },
      initialPageParam: 1,
      getNextPageParam: (lastPage) => {
        if (lastPage.data.length === 0 || lastPage.page * lastPage.limit >= lastPage.total) {
          return undefined
        }
        return lastPage.page + 1
      },
      select: (data) => ({
        ...data,
        pages: data.pages.flatMap((page) => page.data),
      }),
    }
  )
}

export const usePaginatedAllContinueWatching = (
  filters: string = '',
  page: number,
  limit: number = 14
) => {
  return useQuery<PaginatedAnimeResponse>({
    queryKey: ['allContinueWatching', filters, page, limit],
    queryFn: async () => {
      const params = new URLSearchParams(filters)
      params.set('page', String(page))
      params.set('limit', String(limit))
      return fetchApi(`/api/continue-watching/all?${params.toString()}`)
    },
  })
}

export const useRemoveFromWatchlist = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (showId: string) => {
      const response = await fetch(`/api/watchlist/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: showId }),
      })
      if (!response.ok) {
        throw new Error('Failed to remove from watchlist')
      }
    },
    onSuccess: () => {
      toast.success('Removed from watchlist')
      queryClient.invalidateQueries({ queryKey: ['watchlist'] })
    },
    onError: (error) => {
      toast.error(`Failed to remove: ${error.message}`)
    },
  })
}

export interface Notification {
  showId: string
  name: string
  nativeName?: string
  englishName?: string
  thumbnail: string
  episodeNumber: string
  id: string
}

export const useNotifications = (enabled: boolean = true) => {
  return useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => fetchApi('/api/notifications'),
    enabled,
    refetchInterval: 120000,
  })
}

export const useDismissNotification = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ showId, episodeNumber }: { showId: string; episodeNumber: string }) => {
      const response = await fetch(`/api/notifications/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showId, episodeNumber }),
      })
      if (!response.ok) {
        throw new Error('Failed to dismiss notification')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export const useClearAllNotifications = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (showId?: string) => {
      const response = await fetch(`/api/notifications/clear-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showId }),
      })
      if (!response.ok) {
        throw new Error('Failed to clear notifications')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
export const useGenresAndStudios = () => {
  return useQuery<{ genres: string[]; tags: string[]; studios: string[] }>({
    queryKey: ['genresAndStudios'],
    queryFn: () => fetchApi('/api/genres-and-tags'),
    staleTime: 1000 * 60 * 60,
  })
}
