import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '../lib/fetchApi'

export function useShowMeta(showId: string | undefined) {
  return useQuery({
    queryKey: ['show-meta', showId],
    queryFn: async () => {
      if (!showId) return {}
      return fetchApi(`/api/show-meta/${showId}`) as Promise<Record<string, unknown>>
    },
    enabled: !!showId,
    staleTime: 30000,
  })
}
