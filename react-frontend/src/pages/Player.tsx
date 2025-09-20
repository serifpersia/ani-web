import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
// import Hls from 'hls.js'; // Removed static import
import styles from './Player.module.css';
import ToggleSwitch from '../components/common/ToggleSwitch';
import { FaCheck, FaPlus, FaPlay, FaPause, FaVolumeUp, FaVolumeMute, FaExpand, FaCompress, FaClosedCaptioning, FaList } from 'react-icons/fa';
import { formatTime } from '../lib/utils';
import ResumeModal from '../components/common/ResumeModal';
import useIsMobile from '../hooks/useIsMobile';

// Define types for the data structures
interface ShowMeta {
  name: string;
  thumbnail: string;
  description?: string;
}

interface VideoLink {
  resolutionStr: string;
  link: string;
  hls: boolean;
  headers?: { Referer?: string };
}

interface SubtitleTrack {
  src: string;
  lang: string;
  label: string;
}

interface VideoSource {
  sourceName: string;
  links: VideoLink[];
  subtitles?: SubtitleTrack[];
}

interface SkipInterval {
  start_time: number;
  end_time: number;
  skip_type: 'op' | 'ed' | 'recap' | 'mixed_op' | 'mixed_ed' | 'mixed_recap';
  skip_id: string;
}

const Player: React.FC = () => {
  const { id: showId, episodeNumber } = useParams<{ id: string; episodeNumber?: string }>();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressBarThumbRef = useRef<HTMLDivElement>(null); // New ref for the thumb
  const hlsInstance = useRef<any | null>(null); // Changed type to any
  const inactivityTimer = useRef<number | null>(null);
  const wasPlayingBeforeScrub = useRef(false); // To remember if video was playing before scrubbing
  const episodeListRef = useRef<HTMLDivElement>(null); // Ref for episode list scrolling
  const isMobile = useIsMobile();

  // State for show and episode metadata
  const [showMeta, setShowMeta] = useState<ShowMeta | null>(null);
  const [episodes, setEpisodes] = useState<string[]>([]);
  const [watchedEpisodes, setWatchedEpisodes] = useState<string[]>([]);
      const [currentEpisode, setCurrentEpisode] = useState<string | undefined>(episodeNumber);
    
  const [currentMode, setCurrentMode] = useState('sub');
  const [inWatchlist, setInWatchlist] = useState(false);

  // State for video sources and selection
  const [videoSources, setVideoSources] = useState<VideoSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<VideoSource | null>(null);
  const [selectedLink, setSelectedLink] = useState<VideoLink | null>(null);

  // State for player controls
  const [isAutoplayEnabled, setAutoplayEnabled] = useState(() => localStorage.getItem('autoplayEnabled') === 'true');
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [resumeTime, setResumeTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSourceMenu, setShowSourceMenu] = useState(false); // New state for source menu
  const [autoplayBlocked, setAutoplayBlocked] = useState(false); // New state for autoplay blocked
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [hoverTime, setHoverTime] = useState<{ time: number; position: number | null }>({ time: 0, position: null });
  const [skipIntervals, setSkipIntervals] = useState<SkipInterval[]>([]); // State for skip intervals
  const [isAutoSkipEnabled, setIsAutoSkipEnabled] = useState(() => localStorage.getItem('autoSkipEnabled') === 'true'); // State for auto skip
  const [currentSkipInterval, setCurrentSkipInterval] = useState<SkipInterval | null>(null); // State for active skip interval

  // State for CC menu
  const [showCCMenu, setShowCCMenu] = useState(false);
  const [subtitleFontSize, setSubtitleFontSize] = useState(() => parseFloat(localStorage.getItem('subtitleFontSize') || '1.8'));
  const [subtitlePosition, setSubtitlePosition] = useState(() => parseInt(localStorage.getItem('subtitlePosition') || '-4'));
  const [availableSubtitles, setAvailableSubtitles] = useState<TextTrack[]>([]);
  const [activeSubtitleTrack, setActiveSubtitleTrack] = useState<string | null>(null);

  // State for UI
  const [loadingShowData, setLoadingShowData] = useState(true);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWithProfile = async (url: string, options: RequestInit = {}) => {
    const activeProfileId = '1'; // Placeholder
    const newOptions: RequestInit = { ...options };
    newOptions.headers = { ...newOptions.headers, 'X-Profile-ID': activeProfileId };
    if (newOptions.body && typeof newOptions.body === 'string') {
        newOptions.headers = { ...newOptions.headers, 'Content-Type': 'application/json' };
    }
    return fetch(url, newOptions);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
        videoRef.current.play().then(() => {
            setAutoplayBlocked(false); // Reset if user manually plays
        }).catch(error => {
            console.error("Manual play blocked:", error); // Should not happen after user interaction
        });
    } else {
        videoRef.current.pause();
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const newVolume = parseFloat(e.target.value);
    videoRef.current.volume = newVolume;
    setVolume(newVolume);
    videoRef.current.muted = newVolume === 0;
    setIsMuted(newVolume === 0);
    localStorage.setItem('playerVolume', newVolume.toString());
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const newMuted = !videoRef.current.muted;
    videoRef.current.muted = newMuted;
    setIsMuted(newMuted);
    if (!newMuted && volume === 0) {
        const newVolume = 0.5; // Unmute to a default volume
        videoRef.current.volume = newVolume;
        setVolume(newVolume);
    }
    localStorage.setItem('playerMuted', newMuted.toString());
  };

  const toggleFullscreen = () => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) {
        playerContainerRef.current.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
  };

  // Effect to load initial volume from localStorage
  useEffect(() => {
    const savedVolume = localStorage.getItem('playerVolume');
    const savedMute = localStorage.getItem('playerMuted') === 'true';
    const initialVolume = savedVolume ? parseFloat(savedVolume) : 1;
    setVolume(initialVolume);
    setIsMuted(savedMute);
    if (videoRef.current) {
        videoRef.current.volume = initialVolume;
        videoRef.current.muted = savedMute;
    }
  }, []);

  // Effect to fetch show metadata, episode list, and watched status
  useEffect(() => {
    const fetchShowData = async () => {
      if (!showId) return;
      setLoadingShowData(true);
      setError(null);
      try {
        const [metaResponse, episodesResponse, watchlistResponse, watchedResponse] = await Promise.all([
          fetch(`/api/show-meta/${showId}`),
          fetch(`/api/episodes?showId=${showId}&mode=${currentMode}`),
          fetchWithProfile(`/api/watchlist/check/${showId}`),
          fetchWithProfile(`/api/watched-episodes/${showId}`),
        ]);

        if (!metaResponse.ok) throw new Error("Failed to fetch show metadata");
        if (!episodesResponse.ok) throw new Error("Failed to fetch episodes");
        if (!watchlistResponse.ok) throw new Error("Failed to fetch watchlist status");
        if (!watchedResponse.ok) throw new Error("Failed to fetch watched status");

        const meta = await metaResponse.json();
        const episodeData = await episodesResponse.json();
        const watchlistStatus = await watchlistResponse.json();
        const watchedData = await watchedResponse.json();

        setShowMeta({ ...meta, description: episodeData.description });
        setEpisodes(episodeData.episodes.sort((a: string, b: string) => parseFloat(a) - parseFloat(b)));
        setInWatchlist(watchlistStatus.inWatchlist);
        setWatchedEpisodes(watchedData);

        if (!episodeNumber && episodeData.episodes.length > 0) {
          setCurrentEpisode(episodeData.episodes[0]); // Default to the first episode if none in URL
        } else if (episodeNumber) {
          setCurrentEpisode(episodeNumber);
        }
      } catch (e: any) {
        setError(e.message);
        console.error("Error fetching show data:", e);
      } finally {
        setLoadingShowData(false);
      }
    };
    fetchShowData();
  }, [showId, currentMode, episodeNumber]);

  // Effect to fetch available video sources when currentEpisode changes
  useEffect(() => {
    if (!showId || !currentEpisode) return;

    const fetchVideoSources = async () => {
      setLoadingVideo(true);
      setError(null);
      setVideoSources([]);
      setSelectedSource(null);
      try {
        const [sourcesResponse, progressResponse, preferredSourceResponse, skipTimesResponse] = await Promise.all([
          fetch(`/api/video?showId=${showId}&episodeNumber=${currentEpisode}&mode=${currentMode}`),
          fetchWithProfile(`/api/episode-progress/${showId}/${currentEpisode}`),
          fetchWithProfile(`/api/settings/preferredSource`),
          fetch(`/api/skip-times/${showId}/${currentEpisode}`) // Fetch skip times
        ]);

        if (!sourcesResponse.ok) throw new Error("Failed to fetch video sources");
        if (!preferredSourceResponse.ok) throw new Error("Failed to fetch preferred source setting");
        const sources: VideoSource[] = await sourcesResponse.json();
        const { value: preferredSourceName } = await preferredSourceResponse.json();
        setVideoSources(sources);
        

        if (sources.length > 0) {
            let sourceToSelect = sources[0];
            if (preferredSourceName) {
                const foundPreferredSource = sources.find(s => s.sourceName === preferredSourceName);
                if (foundPreferredSource) {
                    sourceToSelect = foundPreferredSource;
                }
            }
            setSelectedSource(sourceToSelect);
            if (sourceToSelect.links.length > 0) {
                setSelectedLink(sourceToSelect.links.sort((a, b) => (parseInt(b.resolutionStr) || 0) - (parseInt(a.resolutionStr) || 0))[0]);
            }
        }

        if (progressResponse.ok) {
            const progress = await progressResponse.json();
            if (progress?.currentTime > 0 && progress.currentTime < progress.duration * 0.95) {
                setResumeTime(progress.currentTime);
                setShowResumeModal(true); // Show the modal again
            }
        }

        if (skipTimesResponse.ok) {
            const skipData = await skipTimesResponse.json();
            if (skipData.found && skipData.results) {
                setSkipIntervals(skipData.results);
            } else {
                setSkipIntervals([]);
            }
        } else {
            setSkipIntervals([]);
        }

      } catch (e: any) {
        setError(e.message);
        console.error("Error fetching video sources:", e);
      } finally {
        setLoadingVideo(false);
      }
    };

    fetchVideoSources();
  }, [showId, currentEpisode, currentMode]);

  // Effect to set the video source when it changes
  useEffect(() => {
    if (!selectedSource || !selectedLink || !videoRef.current) return;

    const videoElement = videoRef.current;
    const proxiedUrl = `/api/proxy?url=${encodeURIComponent(selectedLink.link)}&referer=${encodeURIComponent(selectedLink.headers?.Referer || 'https://allmanga.to')}`;

    if (hlsInstance.current) {
      hlsInstance.current.destroy();
    }
    videoElement.src = '';

    // Clear existing tracks and available subtitles
    while (videoElement.firstChild) {
      videoElement.removeChild(videoElement.firstChild);
    }
    setAvailableSubtitles([]); // Clear availableSubtitles here immediately

    const newAvailableSubtitles: TextTrack[] = []; // To collect newly added tracks

    // Iterate through all subtitles in the selected source and add them as tracks
    if (selectedSource.subtitles && selectedSource.subtitles.length > 0) {
      selectedSource.subtitles.forEach(sub => {
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = sub.label;
        track.srclang = sub.lang;
        track.src = `/api/subtitle-proxy?url=${encodeURIComponent(sub.src)}`;
        // Set default to true for the first English track found, or just the first track
        if (sub.lang === 'en' || sub.label === 'English') {
          track.default = true;
        }
        videoElement.appendChild(track);
        // After appending, the TextTrack object is available in videoElement.textTracks
        if (videoElement.textTracks.length > 0) {
            newAvailableSubtitles.push(videoElement.textTracks[videoElement.textTracks.length - 1]);
        }
      });
    }

    // Set available subtitles after all tracks have been appended
    setAvailableSubtitles(newAvailableSubtitles);

    // Set initial active track based on newAvailableSubtitles
    if (newAvailableSubtitles.length > 0) {
        const englishTrack = newAvailableSubtitles.find(track => track.language === 'en' || track.label === 'English');
        if (englishTrack) {
            setActiveSubtitleTrack(englishTrack.language || englishTrack.label);
            englishTrack.mode = 'showing';
        } else {
            setActiveSubtitleTrack(newAvailableSubtitles[0].language || newAvailableSubtitles[0].label);
            newAvailableSubtitles[0].mode = 'showing';
        }
    } else {
        setActiveSubtitleTrack(null); // No subtitles, so no active track
    }

    if (selectedLink.hls) {
      const loadHls = async () => {
        const Hls = (await import('hls.js')).default;
        if (Hls.isSupported()) {
          const hls = new Hls({ manifestLoadingTimeOut: 20000 });
          hlsInstance.current = hls;
          hls.loadSource(proxiedUrl);
          hls.attachMedia(videoElement);
        } else {
          videoElement.src = proxiedUrl; // Fallback if HLS not supported after dynamic import
        }
      };
      loadHls();
    } else {
      videoElement.src = proxiedUrl;
    }

    

        const savePreferredSource = async () => {
      if (selectedSource) {
        await setPreferredSource(selectedSource.sourceName);
      }
    };
    savePreferredSource();

    return () => {
      if (hlsInstance.current) {
        hlsInstance.current.destroy();
      }
    };
  }, [selectedSource, selectedLink, isAutoplayEnabled]);

  // Effect to save progress periodically
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !showId || !currentEpisode || !showMeta) return;

    const updateProgress = () => {
        if (videoElement.paused || videoElement.duration === 0) return;
        fetchWithProfile('/api/update-progress', {
            method: 'POST',
            body: JSON.stringify({
                showId,
                episodeNumber: currentEpisode,
                currentTime: videoElement.currentTime,
                duration: videoElement.duration,
                showName: showMeta.name,
                showThumbnail: showMeta.thumbnail,
            })
        });
    };

    const interval = setInterval(updateProgress, 5000);

    return () => {
        clearInterval(interval);
    };
  }, [showId, currentEpisode, showMeta]);

  // Effect for Autoplay
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const handleVideoEnd = () => {
        if (isAutoplayEnabled) {
            const currentIndex = episodes.findIndex(ep => ep === currentEpisode);
            if (currentIndex > -1 && currentIndex < episodes.length - 1) {
                const nextEpisode = episodes[currentIndex + 1];
                navigate(`/player/${showId}/${nextEpisode}`);
            }
        }
    };

    videoElement.addEventListener('ended', handleVideoEnd);
    return () => {
        videoElement.removeEventListener('ended', handleVideoEnd);
    };
  }, [isAutoplayEnabled, episodes, currentEpisode, showId, navigate]);

  // Effect to manage control visibility from inactivity
  useEffect(() => {
    const container = playerContainerRef.current;
    if (!container || isMobile) return; // Don't run on mobile

    const handleMouseMove = () => {
        setShowControls(true);
        if (inactivityTimer.current) {
            window.clearTimeout(inactivityTimer.current);
        }
        inactivityTimer.current = window.setTimeout(() => {
            if (isPlaying) {
                setShowControls(false);
            }
        }, 3000);
    };

    const handleMouseLeave = () => {
        if (isPlaying) {
            setShowControls(false);
        }
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    if (!isPlaying) {
        setShowControls(true);
        if (inactivityTimer.current) {
            window.clearTimeout(inactivityTimer.current);
        }
    }

    return () => {
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseleave', handleMouseLeave);
        if (inactivityTimer.current) {
            window.clearTimeout(inactivityTimer.current);
        }
    };
  }, [isPlaying, isMobile]);

  // Effect to handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);


  const handleEpisodeClick = (ep: string) => navigate(`/player/${showId}/${ep}`);

  const toggleWatchlist = async () => {
    if (!showMeta || !showId) return;
    try {
      const endpoint = inWatchlist ? '/api/watchlist/remove' : '/api/watchlist/add';
      const body = { id: showId, name: showMeta.name, thumbnail: showMeta.thumbnail };
      await fetchWithProfile(endpoint, { method: 'POST', body: JSON.stringify(body) });
      setInWatchlist(!inWatchlist);
    } catch (e) {
      console.error("Error toggling watchlist:", e);
      alert("Failed to update watchlist.");
    }
  };

  const handleAutoplayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = e.target.checked;
    setAutoplayEnabled(enabled);
    localStorage.setItem('autoplayEnabled', enabled.toString());
  };

  const seek = (seconds: number) => {
    if (videoRef.current) {
        videoRef.current.currentTime += seconds;
    }
  };

  const handleResume = () => {
    if (videoRef.current) {
        videoRef.current.currentTime = resumeTime;
        videoRef.current.play();
    }
    setShowResumeModal(false);
  };

  const handleStartOver = () => {
    if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play();
    }
    setShowResumeModal(false);
  };

  // Effect for subtitle track management
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const handleAddTrack = () => {
      const tracks = Array.from(videoElement.textTracks);
      setAvailableSubtitles(tracks);

      // Set initial active track if not already set
      if (activeSubtitleTrack === null) {
        const englishTrack = tracks.find(track => track.language === 'en' || track.label === 'English');
        if (englishTrack) {
          setActiveSubtitleTrack(englishTrack.language || englishTrack.label);
          englishTrack.mode = 'showing';
        } else if (tracks.length > 0) {
          setActiveSubtitleTrack(tracks[0].language || tracks[0].label);
          tracks[0].mode = 'showing';
        } else {
          setActiveSubtitleTrack('off');
        }
      }
    };

    const handleRemoveTrack = () => {
      setAvailableSubtitles(Array.from(videoElement.textTracks));
    };

    videoElement.textTracks.addEventListener('addtrack', handleAddTrack);
    videoElement.textTracks.addEventListener('removetrack', handleRemoveTrack);

    // Initial check for tracks already present
    handleAddTrack();

    return () => {
      videoElement.textTracks.removeEventListener('addtrack', handleAddTrack);
      videoElement.textTracks.removeEventListener('removetrack', handleRemoveTrack);
    };
  }, [videoRef.current, activeSubtitleTrack]);

  const handleSubtitleSelection = (trackId: string | null) => {
    if (!videoRef.current) return;

    setActiveSubtitleTrack(trackId);

    Array.from(videoRef.current.textTracks).forEach(track => {
      if (trackId === null) {
        track.mode = 'hidden';
      } else if (track.language === trackId || track.label === trackId) {
        track.mode = 'showing';
      } else {
        track.mode = 'hidden';
      }
    });
  };

  const renderSubtitleOptions = () => {
    const options = [];

    if (availableSubtitles.length > 0) { // Only show "Off" if there are actual subtitles
      options.push(
        <button
          key="off"
          className={`${styles.ccItem} ${activeSubtitleTrack === null ? styles.active : ''}`}
          onClick={() => handleSubtitleSelection(null)}
        >
          Off
        </button>
      );
    }

    availableSubtitles.forEach(track => {
      options.push(
        <button
          key={track.language || track.label}
          className={`${styles.ccItem} ${activeSubtitleTrack === (track.language || track.label) ? styles.active : ''}`}
          onClick={() => handleSubtitleSelection(track.language || track.label)}
        >
          {track.label || track.language}
        </button>
      );
    });

    if (availableSubtitles.length === 0) { // If no subtitles at all, show "Not Available"
        return <button className={`${styles.ccItem} ${styles.disabled}`}>Not Available</button>;
    }

    return <div className={styles.ccOptionsContainer}>{options}</div>;
  };

  const handleSubtitleFontSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseFloat(e.target.value);
    setSubtitleFontSize(newSize);
    localStorage.setItem('subtitleFontSize', newSize.toString());
  };

  const handleSubtitlePositionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPosition = parseInt(e.target.value, 10);
    setSubtitlePosition(newPosition);
    localStorage.setItem('subtitlePosition', newPosition.toString());
  };

  // Effect for subtitle styling
  useEffect(() => {
    let styleElement = document.getElementById('subtitle-style-override') as HTMLStyleElement;
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'subtitle-style-override';
      document.head.appendChild(styleElement);
    }
    styleElement.innerHTML = `
      video::cue {
        font-size: ${subtitleFontSize}rem !important;
        bottom: ${Math.abs(subtitlePosition)}% !important; /* Adjust based on position slider */
      }
    `;
  }, [subtitleFontSize, subtitlePosition]);

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !progressBarRef.current) return;
    if (isNaN(duration) || duration === 0) return; // <--- Add this check

    const rect = progressBarRef.current.getBoundingClientRect();
    const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    videoRef.current.currentTime = percent * duration;
  };

  const handleProgressBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const time = percent * duration;
    setHoverTime({ time, position: e.clientX - rect.left });
  };

  const handleProgressBarMouseLeave = () => {
    setHoverTime({ time: 0, position: null });
  };

  const handleThumbMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault(); // Prevent default drag behavior
    if (!videoRef.current) return;
    setIsScrubbing(true);
    wasPlayingBeforeScrub.current = !videoRef.current.paused;
    videoRef.current.pause();
  };

  // Effect for global mouse move and mouse up for scrubbing
  useEffect(() => {
    const handleDocumentMouseMove = (e: MouseEvent) => {
      if (!isScrubbing || !videoRef.current || !progressBarRef.current || !duration) return;

      const rect = progressBarRef.current.getBoundingClientRect();
      const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const scrubTime = percent * duration;

      videoRef.current.currentTime = scrubTime; // Update video time for preview
      setCurrentTime(scrubTime); // Update state for watched bar

      setHoverTime({ time: scrubTime, position: e.clientX - rect.left });
    };

    const handleDocumentMouseUp = () => {
      if (isScrubbing) {
        setIsScrubbing(false);
        setHoverTime({ time: 0, position: null });
        if (wasPlayingBeforeScrub.current) {
          videoRef.current?.play();
        }
      }
    };

    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    };
  }, [isScrubbing, duration]);

  const scrollToEpisode = (epNum: string) => {
    if (episodeListRef.current) {
      const episodeElement = episodeListRef.current.querySelector(`[data-episode="${epNum}"]`) as HTMLElement;
      if (episodeElement) {
        episodeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        alert(`Episode ${epNum} not found.`);
      }
    }
  };

  const renderEpisodeJumpControls = () => {
    if (episodes.length <= 100) return null;

    const sortedNumericEpisodes = episodes.map(Number).sort((a, b) => a - b);
    const ranges = [];
    for (let i = 0; i < sortedNumericEpisodes.length; i += 100) {
      const start = sortedNumericEpisodes[i];
      const end = sortedNumericEpisodes[Math.min(i + 99, sortedNumericEpisodes.length - 1)];
      ranges.push(
        <button key={`range-${start}`} className={styles.epRangeBtn} onClick={() => scrollToEpisode(start.toString())}>
          Ep {start}-{end}
        </button>
      );
    }

    const handleJumpInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        const inputElement = e.target as HTMLInputElement;
        const epNum = inputElement.value;
        if (episodes.includes(epNum)) {
          scrollToEpisode(epNum);
        } else {
          alert(`Episode ${epNum} not found.`);
        }
        inputElement.value = ''; // Clear input after jump
      }
    };

    const handleJumpBtnClick = () => {
      const inputElement = document.getElementById('ep-jump-input') as HTMLInputElement;
      const epNum = inputElement.value;
      if (episodes.includes(epNum)) {
        scrollToEpisode(epNum);
      } else {
        alert(`Episode ${epNum} not found.`);
      }
      inputElement.value = ''; // Clear input after jump
    };

    return (
      <div className={styles.epJumpControls}>
        <div className={styles.epRangeButtons}>{ranges}</div>
        <div className={styles.epJumpInputGroup}>
          <input type="number" id="ep-jump-input" placeholder="Go to Ep #" min="1" onKeyPress={handleJumpInput} />
          <button id="ep-jump-btn" onClick={handleJumpBtnClick}>Go</button>
        </div>
      </div>
    );
  };

  const setPreferredSource = async (sourceName: string) => {
    try {
      await fetchWithProfile('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ key: 'preferredSource', value: sourceName })
      });
    } catch (error) {
      console.error('Error setting preferred source:', error);
    }
  };

  const renderMobileControls = () => (
    <div className={styles.mobileControls}>
        <div className={styles.playerActions}>
            <button className={styles.seekBtn} onClick={() => seek(-10)}>-10s</button>
            <button className={styles.seekBtn} onClick={() => seek(10)}>+10s</button>
            <div className={styles.toggleContainer}>
                <span>Auto Skip</span>
                <ToggleSwitch id="auto-skip-toggle-mobile" isChecked={isAutoSkipEnabled} onChange={(e) => {
                    setIsAutoSkipEnabled(e.target.checked);
                    localStorage.setItem('autoSkipEnabled', e.target.checked.toString());
                }} />
            </div>
            <div className={styles.toggleContainer}>
                <span>Autoplay</span>
                <ToggleSwitch id="autoplay-toggle-mobile" isChecked={isAutoplayEnabled} onChange={handleAutoplayChange} />
            </div>
        </div>

        <div className={styles.sourceQualityControls}>
            <div className={styles.sourceSelection}>
                <h4>Source</h4>
                <div className={styles.sourceButtons}>
                    {videoSources.map(source => (
                        <button
                            key={source.sourceName}
                            className={`${styles.sourceButton} ${selectedSource?.sourceName === source.sourceName ? styles.active : ''}`}
                            onClick={() => setSelectedSource(source)}
                        >
                            {source.sourceName}
                        </button>
                    ))}
                </div>
            </div>
            {selectedSource && (
                <div className={styles.qualitySelection}>
                    <h4>Quality</h4>
                    <div className={styles.qualityButtons}>
                        {selectedSource.links.sort((a, b) => (parseInt(b.resolutionStr) || 0) - (parseInt(a.resolutionStr) || 0)).map(link => (
                            <button
                                key={link.resolutionStr}
                                className={`${styles.qualityButton} ${selectedLink?.resolutionStr === link.resolutionStr ? styles.active : ''}`}
                                onClick={() => setSelectedLink(link)}
                            >
                                {link.resolutionStr}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    </div>
  );

  if (loadingShowData) return <p className="loading">Loading show data...</p>;
  if (error) return <p className="error-message">Error: {error}</p>;
  if (!showMeta) return <p>Show not found.</p>;

  return (
    <div className={styles.playerPage}>
        <ResumeModal 
            show={showResumeModal}
            resumeTime={formatTime(resumeTime)}
            onResume={handleResume}
            onStartOver={handleStartOver}
        />
      <div className={styles.header}>
        <h2>{showMeta.name}</h2>
        <div className={styles.controls}>
            <button className={`${styles.watchlistBtn} ${inWatchlist ? styles.inList : ''}`} onClick={toggleWatchlist}>
              {inWatchlist ? <FaCheck /> : <FaPlus />}
              {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
            </button>
            <div className={styles.toggleContainer}>
                <span>SUB</span>
                <ToggleSwitch 
                    id="dub-toggle"
                    isChecked={currentMode === 'dub'} 
                    onChange={() => setCurrentMode(currentMode === 'sub' ? 'dub' : 'sub')} 
                />
                <span>DUB</span>
            </div>
        </div>
      </div>

      <div className={styles.descriptionBox}>
        <h3>Description</h3>
        <p dangerouslySetInnerHTML={{ __html: showMeta.description || 'No description available.' }}></p>
      </div>

      <div ref={playerContainerRef} className={styles.videoContainer}>
        {loadingVideo && <p className="loading">Loading video...</p>}
        
        {!isMobile && <div className={`${styles.controlsOverlay} ${!showControls ? styles.hidden : ''}`}>
            {(!isPlaying || autoplayBlocked) && (
                <button className={styles.centerPlayPause} onClick={togglePlay}>
                    <FaPlay />
                </button>
            )}
            <div className={styles.bottomControls}>
                <div
                    className={styles.progressBarContainer}
                    ref={progressBarRef}
                    onClick={handleProgressBarClick}
                    onMouseMove={handleProgressBarMouseMove}
                    onMouseLeave={handleProgressBarMouseLeave}
                >
                    {hoverTime.position !== null && (
                        <div className={styles.timeBubble} style={{ left: hoverTime.position }}>
                            {formatTime(hoverTime.time)}
                        </div>
                    )}
                    <div className={styles.progressBar}>
                        {/* Render skip segments */}
                        {duration > 0 && skipIntervals.map((interval, index) => (
                            <div
                                key={index}
                                className={`${styles.skipSegment} ${styles[interval.skip_type]}`}
                                style={{
                                    left: `${(interval.start_time / duration) * 100}%`,
                                    width: `${((interval.end_time - interval.start_time) / duration) * 100}%`,
                                }}
                            ></div>
                        ))}
                        <div className={styles.bufferedBar} style={{ width: `${(buffered / duration) * 100 || 0}%` }}></div>
                        <div className={styles.watchedBar} style={{ width: `${(currentTime / duration) * 100 || 0}%` }}></div>
                        <div
                            className={styles.thumb}
                            ref={progressBarThumbRef}
                            style={{ left: `${(currentTime / duration) * 100 || 0}%` }}
                            onMouseDown={handleThumbMouseDown}
                        ></div>
                    </div>
                </div>
                <div className={styles.bottomControlsRow}>
                    <div className={styles.leftControls}>
                        <button className={styles.controlBtn} onClick={togglePlay}>{isPlaying ? <FaPause /> : <FaPlay />}</button>
                        <div className={styles.volumeContainer}>
                            <button className={styles.controlBtn} onClick={toggleMute}>{isMuted || volume === 0 ? <FaVolumeMute /> : <FaVolumeUp />}</button>
                            <input 
                                type="range" 
                                min="0" 
                                max="1" 
                                step="0.05" 
                                value={isMuted ? 0 : volume}
                                onChange={handleVolumeChange}
                                className={styles.volumeSlider}
                            />
                        </div>
                        <span className={styles.timeDisplay}>{formatTime(currentTime)} / {formatTime(duration)}</span>
                        <button className={styles.controlBtn} onClick={() => seek(-10)}>
                          <svg width="36" height="36" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" strokeWidth="3" stroke="currentColor" fill="none">
                            <path strokeLinecap="round" d="m9.57 15.41 2.6 8.64 8.64-2.61m6.12 19.97V23a.09.09 0 0 0-.16-.07s-2.58 3.69-4.17 4.78"/>
                            <rect x="32.19" y="22.52" width="11.41" height="18.89" rx="5.7"/>
                            <path d="M12.14 23.94a21.91 21.91 0 1 1-.91 13.25" strokeLinecap="round"/>
                          </svg>
                        </button>
                        <button className={styles.controlBtn} onClick={() => seek(10)}>
                          <svg width="36" height="36" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" strokeWidth="3" stroke="currentColor" fill="none">
                            <path d="M23.93 41.41V23a.09.09 0 0 0-.16-.07s-2.58 3.69-4.17 4.78" strokeLinecap="round"/>
                            <rect x="29.19" y="22.52" width="11.41" height="18.89" rx="5.7"/>
                            <path strokeLinecap="round" d="m54.43 15.41-2.6 8.64-8.64-2.61"/>
                            <path d="M51.86 23.94a21.91 21.91 0 1 0 .91 13.25" strokeLinecap="round"/>
                          </svg>
                        </button>
                        {currentSkipInterval && !isAutoSkipEnabled && (
                            <button className={styles.controlBtn} onClick={() => {
                                if (videoRef.current && currentSkipInterval) {
                                    videoRef.current.currentTime = currentSkipInterval.end_time;
                                    setCurrentSkipInterval(null);
                                }
                            }}>
                                Skip {currentSkipInterval.skip_type === 'op' ? 'Opening' : 'Ending'}
                            </button>
                        )}
                    </div>
                    <div className={styles.rightControls}>
                        {/* Auto Skip Toggle */}
                        <div className={styles.toggleContainer}>
                            <span>Auto Skip</span>
                            <ToggleSwitch id="auto-skip-toggle" isChecked={isAutoSkipEnabled} onChange={(e) => {
                                setIsAutoSkipEnabled(e.target.checked);
                                localStorage.setItem('autoSkipEnabled', e.target.checked.toString());
                            }} />
                        </div>

                        {/* Autoplay Toggle */}
                        <div className={styles.toggleContainer}>
                            <span>Autoplay</span>
                            <ToggleSwitch id="autoplay-toggle" isChecked={isAutoplayEnabled} onChange={handleAutoplayChange} />
                        </div>

                        {/* CC Button and Menu */}
                        <div className={styles.ccMenuContainer}>
                            <button className={styles.controlBtn} onClick={() => setShowCCMenu(!showCCMenu)}><FaClosedCaptioning /></button>
                            {showCCMenu && (
                                <div className={styles.settingsMenu} onClick={e => e.stopPropagation()}>
                                    <h4>Subtitles</h4>
                                    {renderSubtitleOptions()}
                                    <div className={styles.ccDivider}></div>
                                    <h4>Subtitle Settings</h4>
                                    <div className={styles.ccSliderContainer}>
                                        <label htmlFor="fontSizeSlider">Font Size</label>
                                        <input type="range" id="fontSizeSlider" min="1" max="3" step="0.1" value={subtitleFontSize} onChange={handleSubtitleFontSizeChange} />
                                        <span>{subtitleFontSize.toFixed(1)}</span>
                                    </div>
                                    <div className={styles.ccSliderContainer}>
                                        <label htmlFor="positionSlider">Position</label>
                                        <input type="range" id="positionSlider" min="-10" max="0" step="1" value={subtitlePosition} onChange={handleSubtitlePositionChange} />
                                        <span>{subtitlePosition}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Source Selection Button and Menu */}
                        <div className={styles.sourceMenuContainer}>
                            <button className={styles.controlBtn} onClick={() => setShowSourceMenu(!showSourceMenu)}><FaList /></button>
                            {showSourceMenu && (
                                <div className={styles.settingsMenu} onClick={e => e.stopPropagation()}>
                                    <h4>Sources & Quality</h4>
                                    {videoSources.map(source => (
                                        <div key={source.sourceName} className={styles.sourceGroupInMenu}>
                                            <h5>{source.sourceName}</h5>
                                            <div className={styles.qualityListInMenu}>
                                                {source.links.sort((a, b) => (parseInt(b.resolutionStr) || 0) - (parseInt(a.resolutionStr) || 0)).map(link => (
                                                    <button
                                                        key={link.resolutionStr}
                                                        className={`${styles.qualityItemInMenu} ${selectedSource?.sourceName === source.sourceName && selectedLink?.resolutionStr === link.resolutionStr ? styles.active : ''}`}
                                                        onClick={() => {
                                                            setSelectedSource(source);
                                                            setSelectedLink(link);
                                                            setShowSourceMenu(false);
                                                        }}
                                                    >
                                                        {link.resolutionStr}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Fullscreen Button */}
                        <button className={styles.controlBtn} onClick={toggleFullscreen}>{isFullscreen ? <FaCompress /> : <FaExpand />}</button>
                    </div>
                </div>
            </div>
        </div>}

        <video 
            ref={videoRef} 
            controls={isMobile}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onClick={!isMobile ? togglePlay : undefined}
            onLoadedMetadata={() => {
                setDuration(videoRef.current?.duration || 0);
                // Attempt to play after metadata is loaded, if autoplay is enabled
                if (isAutoplayEnabled && videoRef.current) {
                    videoRef.current.play().then(() => {
                        setAutoplayBlocked(false);
                    }).catch(error => {
                        console.error("Autoplay blocked on loaded metadata:", error);
                        setAutoplayBlocked(true);
                        videoRef.current?.pause();
                    });
                }
            }}
            onTimeUpdate={() => {
                if (!isScrubbing) {
                    setCurrentTime(videoRef.current?.currentTime || 0);
                }
                // Check for active skip intervals
                const currentTime = videoRef.current?.currentTime || 0;
                const activeSkip = skipIntervals.find(interval =>
                    currentTime >= interval.start_time && currentTime < interval.end_time
                );
                setCurrentSkipInterval(activeSkip || null);

                // Auto-skip logic
                if (isAutoSkipEnabled && activeSkip && videoRef.current && !videoRef.current.paused) {
                    videoRef.current.currentTime = activeSkip.end_time;
                    setCurrentSkipInterval(null); // Clear after skipping
                }
            }}
            onProgress={() => {
                if (videoRef.current && videoRef.current.buffered.length > 0) {
                    setBuffered(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
                }
            }}
            onVolumeChange={() => {
                if (videoRef.current) {
                    setIsMuted(videoRef.current.muted);
                    setVolume(videoRef.current.volume);
                }
            }}
        />
      </div>

      {isMobile && renderMobileControls()}

      <div className={styles.contentLayout}>
        <div className={styles.episodeListContainer}>
            <h3>Episodes ({currentMode.toUpperCase()})</h3>
            {renderEpisodeJumpControls()}
            <div className={styles.episodeList} ref={episodeListRef}>
                {episodes.map(ep => (
                <button
                    key={ep}
                    data-episode={ep}
                    className={`${styles.episodeItem} ${watchedEpisodes.includes(ep) ? styles.watched : ''} ${ep === currentEpisode ? styles.active : ''}`}
                    onClick={() => handleEpisodeClick(ep)}
                >
                    Ep {ep}
                </button>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
};

export default Player;