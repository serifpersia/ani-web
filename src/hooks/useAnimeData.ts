import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface Anime {
    _id: string;
    id: string;
    name: string;
    nativeName?: string;
    englishName?: string;
    thumbnail: string;
    type?: string;
    episodeNumber?: number;
    currentTime?: number;
    duration?: number;
    availableEpisodesDetail?: {
      sub?: string[];
      dub?: string[];
    };
}

interface WatchlistItem {
  id: string;
  name: string;
  nativeName?: string;
  englishName?: string;
  thumbnail: string;
  status: string;
  type?: string;
  availableEpisodesDetail?: {
    sub?: string[];
    dub?: string[];
  };
}

interface ContinueWatchingItem {
  showId: string;
  episodeNumber: string;
  currentTime: number;
  duration: number;
  name?: string;
  thumbnail?: string;
  nativeName?: string;
  englishName?: string;
}

interface SearchResult {
  results: Anime[];
  totalPages: number;
}

export const fetchAnimeDetails = async (showId: string, showName?: string) => {
  try {
    const searchPromise = showName 
      ? fetch(`/api/search?query=${encodeURIComponent(showName)}`).then(res => res.ok ? res.json() : Promise.resolve(null))
      : Promise.resolve(null);

    const [searchResult, subEpisodesResponse, dubEpisodesResponse] = await Promise.all([
      searchPromise,
      fetch(`/api/episodes?showId=${showId}&mode=sub`),
      fetch(`/api/episodes?showId=${showId}&mode=dub`)
    ]);

    if (!subEpisodesResponse.ok || !dubEpisodesResponse.ok) {
      console.error(`Failed to fetch episodes for ${showId}`);
      return null;
    }

    const subEpisodeData = await subEpisodesResponse.json();
    const dubEpisodeData = await dubEpisodesResponse.json();

    let animeDetails;
    if (searchResult && searchResult.length > 0) {
      const show = searchResult.find(s => s._id === showId) || searchResult[0];
      animeDetails = {
        _id: show._id,
        id: show._id,
        name: show.name,
        nativeName: show.nativeName,
        englishName: show.englishName,
        thumbnail: show.thumbnail,
        type: show.type,
        availableEpisodesDetail: {
          sub: subEpisodeData.episodes,
          dub: dubEpisodeData.episodes,
        },
      };
    } else {
      const metaResponse = await fetch(`/api/show-meta/${showId}`);
      if (!metaResponse.ok) {
        console.error(`Failed to fetch show metadata for ${showId}`);
        return null;
      }
      const meta = await metaResponse.json();
      animeDetails = {
        _id: showId,
        id: showId,
        name: meta.name,
        nativeName: meta.names?.native,
        englishName: meta.names?.english,
        thumbnail: meta.thumbnail,
        type: 'TV',
        availableEpisodesDetail: {
          sub: subEpisodeData.episodes,
          dub: dubEpisodeData.episodes,
        },
      };
    }

    return animeDetails;
  } catch (error) {
    console.error(`Error fetching details for ${showId}:`, error);
    return null;
  }
};

const fetchLatestReleases = async (): Promise<Anime[]> => {
  const response = await fetch("/api/latest-releases");
  if (!response.ok) throw new Error("Failed to fetch latest releases");
  const data: ShowItem[] = await response.json();

  const detailedLatestReleases = await Promise.all(
    data.map(async (item: ShowItem) => {
      const animeDetails = await fetchAnimeDetails(item._id);
      if (animeDetails) {
        return { ...animeDetails, ...item };
      } else {
        return null;
      }
    })
  );
  return detailedLatestReleases.filter(Boolean) as Anime[];
};

export const useLatestReleases = () => {
  return useQuery<Anime[]>({ 
    queryKey: ['latestReleases'],
    queryFn: fetchLatestReleases,
  });
};

const fetchCurrentSeasonPage = async ({ pageParam = 1 }): Promise<Anime[]> => {
  const response = await fetch(`/api/seasonal?page=${pageParam}`);
  if (!response.ok) throw new Error("Failed to fetch current season");
  const newShows: ShowItem[] = await response.json();

  const detailedNewShows = await Promise.all(
    newShows.map(async (item: ShowItem) => {
      const animeDetails = await fetchAnimeDetails(item._id);
      if (animeDetails) {
        return { ...animeDetails, ...item };
      } else {
        return null;
      }
    })
  );
  return detailedNewShows.filter(Boolean) as Anime[];
};

export const useCurrentSeason = () => {
  return useInfiniteQuery<Anime[], Error, Anime[], string[], number>({
    queryKey: ['currentSeason'],
    queryFn: fetchCurrentSeasonPage,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length === 0) return undefined;
      return allPages.length + 1;
    },
  });
};

const fetchContinueWatching = async (): Promise<Anime[]> => {
  const response = await fetch("/api/continue-watching");
  if (!response.ok) throw new Error("Failed to fetch continue watching");
  const data: ContinueWatchingItem[] = await response.json();

  const detailedContinueWatchingList = await Promise.all(
    data.map(async (item: ContinueWatchingItem) => {
      const animeDetails = await fetchAnimeDetails(item.showId, item.name);
      if (animeDetails) {
        return {
          ...animeDetails,
          episodeNumber: item.episodeNumber,
          currentTime: item.currentTime,
          duration: item.duration,
          nativeName: item.nativeName,
          englishName: item.englishName,
        };
      } else {
        return null;
      }
    })
  );
  return detailedContinueWatchingList.filter(Boolean) as Anime[];
};

export const useContinueWatching = () => {
  return useQuery<Anime[]>({ 
    queryKey: ['continueWatching'],
    queryFn: fetchContinueWatching,
  });
};



export const useSearchAnime = (searchQueryString: string) => {
  return useInfiniteQuery<SearchResult, Error, SearchResult, string[], number>({
    queryKey: ['searchAnime', searchQueryString],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams(searchQueryString);
      params.set('page', pageParam.toString());
      const response = await fetch(`/api/search?${params.toString()}`);
      if (!response.ok) throw new Error('Search failed');
      const apiResponse = await response.json();

      let results: Anime[] = [];
      let totalPages: number = 1;

      if (Array.isArray(apiResponse)) {
        results = apiResponse as Anime[];
      } else if (apiResponse && Array.isArray(apiResponse.results)) {
        results = apiResponse.results as Anime[];
        totalPages = apiResponse.totalPages || 1;
      } else {
        console.warn("API /api/search returned an unexpected data structure:", apiResponse);
      }

      const detailedResults = await Promise.all(
        results.map(async (anime: Anime) => {
          const animeDetails = await fetchAnimeDetails(anime._id);
          return { ...anime, ...animeDetails };
        })
      );

      return {
        results: detailedResults.filter(Boolean) as Anime[],
        totalPages: totalPages,
        currentPage: pageParam,
      };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.results.length > 0) {
        return lastPage.currentPage + 1;
      }
      return undefined;
    },
    enabled: !!searchQueryString,
  });
};

const fetchWatchlist = async (): Promise<Anime[]> => {
  const response = await fetch("/api/watchlist");
  if (!response.ok) throw new Error("Failed to fetch watchlist");
  const data: WatchlistItem[] = await response.json();

  const detailedWatchlist = await Promise.all(
    data.map(async (item: WatchlistItem) => {
      const animeDetails = await fetchAnimeDetails(item.id, item.name);
      if (animeDetails) {
        return {
          ...animeDetails,
          ...item,
          name: item.name || animeDetails.name,
          nativeName: item.nativeName || animeDetails.nativeName,
          englishName: item.englishName || animeDetails.englishName,
        };
      } else {
        return null;
      }
    })
  );
  return detailedWatchlist.filter(Boolean) as Anime[];
};

export const useWatchlist = () => {
  return useQuery<Anime[]>({ 
    queryKey: ['watchlist'],
    queryFn: fetchWatchlist,
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