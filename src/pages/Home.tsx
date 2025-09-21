import React, { useState, useEffect, useRef } from 'react';
import AnimeSection from '../components/anime/AnimeSection';
import Top10List from '../components/anime/Top10List';
import Schedule from '../components/anime/Schedule';
import AnimeCardSkeleton from '../components/anime/AnimeCardSkeleton';

// Define the type for the anime item
interface Anime {
    _id: string;
    id: string;
    name: string;
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

const SkeletonGrid = () => (
    <div className="grid-container">
        {Array.from({ length: 10 }).map((_, i) => <AnimeCardSkeleton key={i} />)}
    </div>
);

const Home: React.FC = () => {
  const [latestReleases, setLatestReleases] = useState<Anime[]>([]);
  const [currentSeason, setCurrentSeason] = useState<Anime[]>([]);
  const [continueWatchingList, setContinueWatchingList] = useState<Anime[]>([]);

  const [loadingLatestReleases, setLoadingLatestReleases] = useState(true);
  const [loadingContinueWatching, setLoadingContinueWatching] = useState(true);
  const [loadingCurrentSeason, setLoadingCurrentSeason] = useState(true); // New state for initial loading of Current Season

  const seasonalState = useRef({ page: 1, isLoading: false, hasMore: true });

  const fetchLatestReleases = async () => {
    try {
      const response = await fetch("/api/latest-releases");
      if (!response.ok) throw new Error("Failed to fetch latest releases");
      const data = await response.json();

      const detailedLatestReleases = await Promise.all(
        data.map(async (item: any) => {
          const animeDetails = await fetchAnimeDetails(item._id);
          if (animeDetails) {
            return { ...animeDetails, ...item }; // Merge existing item data with fetched details
          } else {
            return null; // Handle cases where details couldn't be fetched
          }
        })
      );
      setLatestReleases(detailedLatestReleases.filter(Boolean) as Anime[]);
    } catch (error) {
      console.error("Error fetching latest releases:", error);
    } finally {
      setLoadingLatestReleases(false);
    }
  };

  const fetchCurrentSeason = async () => {
    if (seasonalState.current.isLoading || !seasonalState.current.hasMore) return;
    seasonalState.current.isLoading = true;

    try {
      const response = await fetch(`/api/seasonal?page=${seasonalState.current.page}`);
      if (!response.ok) throw new Error("Failed to fetch current season");
      const newShows = await response.json();
      if (newShows.length === 0) {
        seasonalState.current.hasMore = false;
      } else {
        const detailedNewShows = await Promise.all(
          newShows.map(async (item: any) => {
            const animeDetails = await fetchAnimeDetails(item._id);
            if (animeDetails) {
              return { ...animeDetails, ...item }; // Merge existing item data with fetched details
            } else {
              return null; // Handle cases where details couldn't be fetched
            }
          })
        );
        setCurrentSeason(prev => [...prev, ...detailedNewShows.filter(Boolean) as Anime[]]);
        seasonalState.current.page++;
      }
    } catch (error) {
      console.error("Error fetching current season:", error);
    } finally {
      seasonalState.current.isLoading = false;
      setLoadingCurrentSeason(false);
    }
  };

  const handleRemoveContinueWatching = async (showId: string) => {
    try {
      // Optimistically update UI
      setContinueWatchingList(prevList => prevList.filter(anime => anime.id !== showId));

      // Call backend API to remove from continue watching
      const response = await fetch("/api/continue-watching/remove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Profile-ID": "1", // Placeholder
        },
        body: JSON.stringify({ showId }),
      });

      if (!response.ok) {
        // If backend call fails, revert UI (optional, but good practice)
        console.error("Failed to remove from backend, reverting UI.");
        // Re-fetch or add back the item
        fetchContinueWatching(); 
      }
    } catch (error) {
      console.error("Error removing from continue watching:", error);
      fetchContinueWatching(); // Re-fetch on error
    } finally {
      // Optional: Add a loading state setter here if removal had a loading state
      console.log("Remove continue watching operation completed.");
    }
  };

  const fetchAnimeDetails = async (showId: string) => {
    try {
      const [metaResponse, subEpisodesResponse, dubEpisodesResponse] = await Promise.all([
        fetch(`/api/show-meta/${showId}`),
        fetch(`/api/episodes?showId=${showId}&mode=sub`),
        fetch(`/api/episodes?showId=${showId}&mode=dub`)
      ]);

      if (!metaResponse.ok) throw new Error("Failed to fetch show metadata");
      if (!subEpisodesResponse.ok) throw new Error("Failed to fetch sub episodes");
      if (!dubEpisodesResponse.ok) throw new Error("Failed to fetch dub episodes");

      const meta = await metaResponse.json();
      const subEpisodeData = await subEpisodesResponse.json();
      const dubEpisodeData = await dubEpisodesResponse.json();

      const animeDetails = {
        _id: showId,
        id: showId,
        name: meta.name,
        thumbnail: meta.thumbnail,
        type: meta.type,
        availableEpisodesDetail: {
          sub: subEpisodeData.episodes,
          dub: dubEpisodeData.episodes,
        },
      };
      return animeDetails;
    } catch (error) {
      console.error(`Error fetching details for ${showId}:`, error);
      return null;
    }
  };

  const fetchContinueWatching = async () => {
    try {
      const response = await fetch("/api/continue-watching", {
        headers: { 'X-Profile-ID': '1' } // Placeholder
      });
      if (!response.ok) throw new Error("Failed to fetch continue watching");
      const data = await response.json();

      const detailedContinueWatchingList = await Promise.all(
        data.map(async (item: any) => {
          const animeDetails = await fetchAnimeDetails(item.showId);
          if (animeDetails) {
            return {
              ...animeDetails,
              episodeNumber: item.episodeNumber,
              currentTime: item.currentTime,
              duration: item.duration
            };
          } else {
            return null; // Handle cases where details couldn't be fetched
          }
        })
      );
      setContinueWatchingList(detailedContinueWatchingList.filter(Boolean) as Anime[]);
    } catch (error) {
      console.error("Error fetching continue watching:", error);
    } finally {
      setLoadingContinueWatching(false);
    }
  };

  useEffect(() => {
    fetchLatestReleases();
    fetchCurrentSeason();
    fetchContinueWatching();

    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000 && // Increased trigger offset
        !seasonalState.current.isLoading &&
        seasonalState.current.hasMore
      ) {
        fetchCurrentSeason();
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div>
      <div className="home-container">
        <div className="main-content">
          <AnimeSection 
            title="Continue Watching" 
            continueWatching={true} 
            animeList={continueWatchingList} 
            onRemove={handleRemoveContinueWatching} 
            loading={loadingContinueWatching}
          />

          <AnimeSection title="Latest Releases" continueWatching={false} animeList={latestReleases} loading={loadingLatestReleases} />

          <AnimeSection title="Current Season" continueWatching={false} animeList={currentSeason} loading={loadingCurrentSeason} />
          {!loadingCurrentSeason && seasonalState.current.isLoading && <SkeletonGrid />}
          {!seasonalState.current.hasMore && currentSeason.length > 0 && <p style={{textAlign: 'center', margin: '1rem'}}>No more Current Season anime.</p>}
        </div>
        <aside className="sidebar">
          <Top10List title="Top 10 Popular" />
        </aside>
      </div>
      <Schedule />
    </div>
  );
};

export default Home;