import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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

export const useInfiniteContinueWatching = () => {
    return useInfiniteQuery({
        queryKey: ['continueWatching'],
        queryFn: ({ pageParam = 1 }) => fetchApi(`/api/continue-watching?page=${pageParam}&limit=14`),
        initialPageParam: 1,
        getNextPageParam: (lastPage: Anime[], allPages) => {
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

export const useInfiniteWatchlist = () => {
    return useInfiniteQuery<Anime[]>({
        queryKey: ['watchlist'],
        queryFn: ({ pageParam = 1 }) => fetchApi(`/api/watchlist?page=${pageParam}&limit=14`),
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
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });
};