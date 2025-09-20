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

  const seasonalState = useRef({ page: 1, isLoading: false, hasMore: true });

  const fetchLatestReleases = async () => {
    try {
      const response = await fetch("/api/latest-releases");
      if (!response.ok) throw new Error("Failed to fetch latest releases");
      const data = await response.json();
      setLatestReleases(data);
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
        setCurrentSeason(prev => [...prev, ...newShows]);
        seasonalState.current.page++;
      }
    } catch (error) {
      console.error("Error fetching current season:", error);
    } finally {
      seasonalState.current.isLoading = false;
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

  const fetchContinueWatching = async () => {
    try {
      const response = await fetch("/api/continue-watching", {
        headers: { 'X-Profile-ID': '1' } // Placeholder
      });
      if (!response.ok) throw new Error("Failed to fetch continue watching");
      const data = await response.json();
      const mappedData = data.map((item: any) => ({
        ...item,
        _id: item.showId,
        id: item.showId,
        episodeNumber: item.episodeNumber,
        currentTime: item.currentTime,
        duration: item.duration
      }));
      setContinueWatchingList(mappedData);
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
          {loadingContinueWatching ? (
            <SkeletonGrid />
          ) : continueWatchingList.length > 0 && (
            <AnimeSection 
              title="Continue Watching" 
              continueWatching={true} 
              animeList={continueWatchingList} 
              onRemove={handleRemoveContinueWatching} // <--- Add this prop
            />
          )}

          {loadingLatestReleases ? (
            <SkeletonGrid />
          ) : (
            <AnimeSection title="Latest Releases" continueWatching={false} animeList={latestReleases} />
          )}

          <AnimeSection title="Current Season" continueWatching={false} animeList={currentSeason} />
          {seasonalState.current.isLoading && <SkeletonGrid />}
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