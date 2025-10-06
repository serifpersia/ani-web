import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

export interface Anime {
    _id: string;
    id: string;
    name: string;
    nativeName?: string;
    englishName?: string;
    thumbnail: string;
    type?: string;
    status?: string;
    episodeNumber?: number;
    currentTime?: number;
    duration?: number;
    nextEpisodeToWatch?: string;
    newEpisodesCount?: number;
    availableEpisodesDetail?: {
      sub?: string[];
      dub?: string[];
    };
}

const fetchApi = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch from ${url}`);
    }
    return response.json();
};

export const useLatestReleases = () => {
    return useQuery<Anime[]>({
        queryKey: ['latestReleases'],
        queryFn: () => fetchApi("/api/latest-releases"),
    });
};

export const useCurrentSeason = () => {
    return useInfiniteQuery({
        queryKey: ['currentSeason'],
        queryFn: ({ pageParam = 1 }) => fetchApi(`/api/seasonal?page=${pageParam}`),
        initialPageParam: 1,
        getNextPageParam: (lastPage: Anime[], allPages) => {
            return lastPage.length > 0 ? allPages.length + 1 : undefined;
        },
    });
};

export const useContinueWatching = () => {
    return useQuery<Anime[]>({
        queryKey: ['continueWatching'],
        queryFn: () => fetchApi(`/api/continue-watching`),
    });
};

export const useAllContinueWatching = () => {
    return useInfiniteQuery<Anime[]>({
        queryKey: ['allContinueWatching'],
        queryFn: ({ pageParam = 1 }) => fetchApi(`/api/continue-watching/all?page=${pageParam}`),
        initialPageParam: 1,
        getNextPageParam: (lastPage, allPages) => {
            return lastPage.length > 0 ? allPages.length + 1 : undefined;
        },
    });
};

interface SearchResult {
    results: Anime[];
    totalPages: number;
    currentPage: number;
}

export const useSearchAnime = (searchQueryString: string) => {
    return useInfiniteQuery<SearchResult>({
        queryKey: ['searchAnime', searchQueryString],
        queryFn: async ({ pageParam = 1 }) => {
            const params = new URLSearchParams(searchQueryString);
            params.set('page', pageParam.toString());
            const data = await fetchApi(`/api/search?${params.toString()}`);
            return {
                results: data,
                totalPages: 1, 
                currentPage: pageParam,
            };
        },
        initialPageParam: 1,
        getNextPageParam: (lastPage) => {
            return lastPage.results.length > 0 ? lastPage.currentPage + 1 : undefined;
        },
        enabled: !!searchQueryString,
    });
};

export const useInfiniteWatchlist = (status: string) => {
    return useInfiniteQuery<Anime[]>({
        queryKey: ['watchlist', status],
        queryFn: ({ pageParam = 1 }) => fetchApi(`/api/watchlist?status=${status}&page=${pageParam}&limit=14`),
        initialPageParam: 1,
        getNextPageParam: (lastPage, allPages) => {
            return lastPage.length > 0 ? allPages.length + 1 : undefined;
        },
    });
};

export const useRemoveFromWatchlist = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (showId: string) => {
      const response = await fetch(`/api/watchlist/remove`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: showId }),
      });
      if (!response.ok) {
        throw new Error("Failed to remove from watchlist");
      }
    },
    onSuccess: () => {
      toast.success('Removed from watchlist');
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
    onError: (error) => {
      toast.error(`Failed to remove: ${error.message}`);
    },
  });
};