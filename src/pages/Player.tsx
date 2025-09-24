import React, { useEffect, useReducer, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styles from './Player.module.css';
import ToggleSwitch from '../components/common/ToggleSwitch';
import { FaCheck, FaPlus, FaPlay, FaPause, FaVolumeUp, FaVolumeMute, FaVolumeDown, FaVolumeOff, FaExpand, FaCompress, FaClosedCaptioning, FaList, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { formatTime, fixThumbnailUrl } from '../lib/utils';
import ResumeModal from '../components/common/ResumeModal';
import useIsMobile from '../hooks/useIsMobile';
import Hls from 'hls.js';

// --- INTERFACES ---
interface SimpleShowMeta {
  name: string;
  thumbnail: string;
  description?: string;
}

interface DetailedShowMeta {
  id: string;
  route: string;
  title: string;
  genres: { name: string; route: string }[];
  studios: { name: string; route: string }[];
  sources: { name: string; route: string }[];
  mediaTypes: { name: string; route: string }[];
  episodes: number;
  lengthMin: number;
  status: string;
  imageVersionRoute: string;
  stats: {
    averageScore: number;
    ratingCount: number;
    trackedCount: number;
    trackedRating: number;
    colorLightMode: string;
    colorDarkMode: string;
  };
  names: {
    romaji: string;
    english: string;
    native: string;
  };
  websites: {
    official: string;
    mal: string;
    aniList: string;
    kitsu: string;
    animePlanet: string;
    anidb: string;
    streams: { platform: string; url: string; name: string }[];
  };
  nextEpisodeAirDate?: string;
}

interface AllMangaDetail {
  Rating: string;
  Season: string;
  Episodes: string;
  Date: string;
  "Original Broadcast": string;
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

// --- STATE & ACTION TYPES ---
interface PlayerState {
  showMeta: Partial<SimpleShowMeta & DetailedShowMeta>;
  episodes: string[];
  watchedEpisodes: string[];
  currentEpisode?: string;
  allMangaDetails: AllMangaDetail | null;
  showCombinedDetails: boolean;
  currentMode: 'sub' | 'dub';
  inWatchlist: boolean;
  videoSources: VideoSource[];
  selectedSource: VideoSource | null;
  selectedLink: VideoLink | null;
  isAutoplayEnabled: boolean;
  showResumeModal: boolean;
  resumeTime: number;
  isPlaying: boolean;
  showControls: boolean;
  showSourceMenu: boolean;
  autoplayBlocked: boolean;
  currentTime: number;
  duration: number;
  isMuted: boolean;
  volume: number;
  isFullscreen: boolean;
  isScrubbing: boolean;
  buffered: number;
  hoverTime: { time: number; position: number | null };
  skipIntervals: SkipInterval[];
  isAutoSkipEnabled: boolean;
  currentSkipInterval: SkipInterval | null;
  showCCMenu: boolean;
  subtitleFontSize: number;
  subtitlePosition: number;
  availableSubtitles: TextTrack[];
  activeSubtitleTrack: string | null;
  loadingShowData: boolean;
  loadingVideo: boolean;
  error: string | null;
}

type Action =
  | { type: 'SET_STATE'; payload: Partial<PlayerState> }
  | { type: 'SET_LOADING'; key: 'loadingShowData' | 'loadingVideo'; value: boolean }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'SHOW_DATA_SUCCESS'; payload: Partial<PlayerState> }
  | { type: 'VIDEO_DATA_SUCCESS'; payload: Partial<PlayerState> }
  | { type: 'SET_PLAY_STATUS'; payload: boolean }
  | { type: 'SET_VIDEO_ELEMENT_STATE'; payload: Partial<PlayerState> }
  | { type: 'SET_SUBTITLE_TRACKS'; payload: TextTrack[] }
  | { type: 'SET_ACTIVE_SUBTITLE_TRACK'; payload: string | null };


// --- INITIAL STATE ---
const initialState: PlayerState = {
  showMeta: {},
  episodes: [],
  watchedEpisodes: [],
  currentEpisode: undefined,
  allMangaDetails: null,
  showCombinedDetails: false,
  currentMode: 'sub',
  inWatchlist: false,
  videoSources: [],
  selectedSource: null,
  selectedLink: null,
  isAutoplayEnabled: localStorage.getItem('autoplayEnabled') === 'true',
  showResumeModal: false,
  resumeTime: 0,
  isPlaying: false,
  showControls: true,
  showSourceMenu: false,
  autoplayBlocked: false,
  currentTime: 0,
  duration: 0,
  isMuted: false,
  volume: 1,
  isFullscreen: false,
  isScrubbing: false,
  buffered: 0,
  hoverTime: { time: 0, position: null },
  skipIntervals: [],
  isAutoSkipEnabled: localStorage.getItem('autoSkipEnabled') === 'true',
  currentSkipInterval: null,
  showCCMenu: false,
  subtitleFontSize: parseFloat(localStorage.getItem('subtitleFontSize') || '1.8'),
  subtitlePosition: parseInt(localStorage.getItem('subtitlePosition') || '-4'),
  availableSubtitles: [],
  activeSubtitleTrack: null,
  loadingShowData: true,
  loadingVideo: false,
  error: null,
};

// --- REDUCER ---
function playerReducer(state: PlayerState, action: Action): PlayerState {
  switch (action.type) {
    case 'SET_STATE':
      return { ...state, ...action.payload };
    case 'SET_LOADING':
      return { ...state, [action.key]: action.value };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loadingShowData: false, loadingVideo: false };
    case 'SHOW_DATA_SUCCESS':
      return { ...state, ...action.payload, loadingShowData: false, error: null };
    case 'VIDEO_DATA_SUCCESS':
      return { ...state, ...action.payload, loadingVideo: false, error: null };
    case 'SET_PLAY_STATUS':
      return { ...state, isPlaying: action.payload };
    case 'SET_VIDEO_ELEMENT_STATE':
      return { ...state, ...action.payload };
    case 'SET_SUBTITLE_TRACKS':
        return { ...state, availableSubtitles: action.payload };
    case 'SET_ACTIVE_SUBTITLE_TRACK':
        return { ...state, activeSubtitleTrack: action.payload };
    default:
      return state;
  }
}

// --- COMPONENT ---
const Player: React.FC = () => {
  const { id: showId, episodeNumber } = useParams<{ id: string; episodeNumber?: string }>();
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(playerReducer, initialState);

  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const hlsInstance = useRef<Hls | null>(null);
  const inactivityTimer = useRef<number | null>(null);
  const wasPlayingBeforeScrub = useRef(false);
  const isMobile = useIsMobile();

  const fetchWithProfile = async (url: string, options: RequestInit = {}) => {
    const newOptions: RequestInit = { ...options };
    if (newOptions.body && typeof newOptions.body === 'string') {
        newOptions.headers = { ...newOptions.headers, 'Content-Type': 'application/json' };
    }
    return fetch(url, newOptions);
  };

  useEffect(() => {
    const fetchShowData = async () => {
      if (!showId) return;
      dispatch({ type: 'SET_LOADING', key: 'loadingShowData', value: true });
      try {
        const [metaResponse, detailsResponse, episodesResponse, watchlistResponse, watchedResponse, allmangaDetailsResponse] = await Promise.all([
          fetch(`/api/show-meta/${showId}`),
          fetch(`/api/show-details/${showId}`),
          fetch(`/api/episodes?showId=${showId}&mode=${state.currentMode}`),
          fetchWithProfile(`/api/watchlist/check/${showId}`),
          fetchWithProfile(`/api/watched-episodes/${showId}`),
          fetch(`/api/allmanga-details/${showId}`),
        ]);

        if (!metaResponse.ok) throw new Error("Failed to fetch show metadata");
        if (!episodesResponse.ok) throw new Error("Failed to fetch episodes");

        const meta = await metaResponse.json();
        const details = detailsResponse.ok ? await detailsResponse.json() : {};
        const episodeData = await episodesResponse.json();
        const watchlistStatus = watchlistResponse.ok ? await watchlistResponse.json() : { inWatchlist: false };
        const watchedData = watchedResponse.ok ? await watchedResponse.json() : [];
        const allmangaDetails = allmangaDetailsResponse.ok ? await allmangaDetailsResponse.json() : null;

        dispatch({
          type: 'SHOW_DATA_SUCCESS',
          payload: {
            showMeta: { ...meta, ...details, description: episodeData.description },
            episodes: episodeData.episodes.sort((a: string, b: string) => parseFloat(a) - parseFloat(b)),
            inWatchlist: watchlistStatus.inWatchlist,
            watchedEpisodes: watchedData,
            allMangaDetails: allmangaDetails,
            currentEpisode: episodeNumber || (episodeData.episodes.length > 0 ? episodeData.episodes[0] : undefined),
          },
        });
      } catch (e) {
        dispatch({ type: 'SET_ERROR', payload: e instanceof Error ? e.message : 'An unknown error occurred' });
      }
    };
    fetchShowData();
  }, [showId, state.currentMode, episodeNumber]);

  const setPreferredSource = useCallback(async (sourceName: string) => {
    try {
      await fetchWithProfile('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ key: 'preferredSource', value: sourceName })
      });
    } catch (error) {
      console.error('Error setting preferred source:', error);
    }
  }, []);

  useEffect(() => {
    if (!showId || !state.currentEpisode) return;

    const fetchVideoSources = async () => {
      dispatch({ type: 'SET_LOADING', key: 'loadingVideo', value: true });
      dispatch({ type: 'SET_STATE', payload: { videoSources: [], selectedSource: null, selectedLink: null, skipIntervals: [] } });
      try {
        const [sourcesResponse, progressResponse, preferredSourceResponse, skipTimesResponse] = await Promise.all([
          fetch(`/api/video?showId=${showId}&episodeNumber=${state.currentEpisode}&mode=${state.currentMode}`),
          fetchWithProfile(`/api/episode-progress/${showId}/${state.currentEpisode}`),
          fetchWithProfile(`/api/settings/preferredSource`),
          fetch(`/api/skip-times/${showId}/${state.currentEpisode}`)
        ]);

        if (!sourcesResponse.ok) throw new Error("Failed to fetch video sources");
        const sources: VideoSource[] = await sourcesResponse.json();
        const preferredSourceName = preferredSourceResponse.ok ? (await preferredSourceResponse.json()).value : null;

        let sourceToSelect: VideoSource | null = sources.length > 0 ? sources[0] : null;
        if (preferredSourceName) {
            const foundPreferredSource = sources.find(s => s.sourceName === preferredSourceName);
            if (foundPreferredSource) sourceToSelect = foundPreferredSource;
        }
        
        const selectedLink = sourceToSelect && sourceToSelect.links.length > 0
            ? sourceToSelect.links.sort((a, b) => (parseInt(b.resolutionStr) || 0) - (parseInt(a.resolutionStr) || 0))[0]
            : null;

        let resumeTime = 0;
        let showResumeModal = false;
        if (progressResponse.ok) {
            const progress = await progressResponse.json();
            if (progress?.currentTime > 0 && progress.currentTime < progress.duration * 0.95) {
                resumeTime = progress.currentTime;
                showResumeModal = true;
            }
        }

        const skipIntervals = skipTimesResponse.ok ? (await skipTimesResponse.json()).results || [] : [];

        dispatch({
          type: 'VIDEO_DATA_SUCCESS',
          payload: {
            videoSources: sources,
            selectedSource: sourceToSelect,
            selectedLink,
            resumeTime,
            showResumeModal,
            skipIntervals,
          },
        });

      } catch (e) {
        dispatch({ type: 'SET_ERROR', payload: e instanceof Error ? e.message : 'An unknown error occurred' });
      }
    };

    fetchVideoSources();
  }, [showId, state.currentEpisode, state.currentMode]);

  useEffect(() => {
    if (!state.selectedSource || !state.selectedLink || !videoRef.current) return;

    const videoElement = videoRef.current;
    let proxiedUrl = `/api/proxy?url=${encodeURIComponent(state.selectedLink.link)}`;
    if (state.selectedLink.headers?.Referer) {
        proxiedUrl += `&referer=${encodeURIComponent(state.selectedLink.headers.Referer)}`;
    }

    if (hlsInstance.current) {
      hlsInstance.current.destroy();
    }
    videoElement.src = '';
    while (videoElement.firstChild) {
      videoElement.removeChild(videoElement.firstChild);
    }

    if (state.selectedSource.subtitles) {
        state.selectedSource.subtitles.forEach(sub => {
            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.label = sub.label;
            track.srclang = sub.lang;
            track.src = `/api/subtitle-proxy?url=${encodeURIComponent(sub.src)}`;
            if (sub.lang === 'en' || sub.label === 'English') {
                track.default = true;
            }
            videoElement.appendChild(track);
        });
    }

    if (state.selectedLink.hls) {
      if (Hls.isSupported()) {
        const hls = new Hls();
        hlsInstance.current = hls;
        hls.loadSource(proxiedUrl);
        hls.attachMedia(videoElement);
      } else {
        videoElement.src = proxiedUrl;
      }
    } else {
      videoElement.src = proxiedUrl;
    }

    setPreferredSource(state.selectedSource.sourceName);

    const savedVolume = localStorage.getItem('playerVolume');
    const savedMuted = localStorage.getItem('playerMuted');

    if (savedVolume !== null) {
      const newVolume = parseFloat(savedVolume);
      videoElement.volume = newVolume;
      dispatch({ type: 'SET_STATE', payload: { volume: newVolume } });
    }
    if (savedMuted !== null) {
      const newMuted = savedMuted === 'true';
      videoElement.muted = newMuted;
      dispatch({ type: 'SET_STATE', payload: { isMuted: newMuted } });
    }

    return () => {
      if (hlsInstance.current) {
        hlsInstance.current.destroy();
      }
    };
  }, [state.selectedSource, state.selectedLink, setPreferredSource]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !showId || !state.currentEpisode || !state.showMeta) return;

    const updateProgress = () => {
        if (videoElement.paused || videoElement.duration === 0) return;
        fetchWithProfile('/api/update-progress', {
            method: 'POST',
            body: JSON.stringify({
                showId,
                episodeNumber: state.currentEpisode,
                currentTime: videoElement.currentTime,
                duration: videoElement.duration,
                showName: state.showMeta.name,
                showThumbnail: fixThumbnailUrl(state.showMeta.thumbnail!),
            })
        });
    };
    const interval = setInterval(updateProgress, 5000);
    return () => clearInterval(interval);
  }, [showId, state.currentEpisode, state.showMeta]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    const handleVideoEnd = () => {
        if (state.isAutoplayEnabled) {
            const currentIndex = state.episodes.findIndex(ep => ep === state.currentEpisode);
            if (currentIndex > -1 && currentIndex < state.episodes.length - 1) {
                const nextEpisode = state.episodes[currentIndex + 1];
                navigate(`/player/${showId}/${nextEpisode}`);
            }
        }
    };
    videoElement.addEventListener('ended', handleVideoEnd);
    return () => {
        if (videoElement) {
            videoElement.removeEventListener('ended', handleVideoEnd);
        }
    };
  }, [state.isAutoplayEnabled, state.episodes, state.currentEpisode, showId, navigate]);

  useEffect(() => {
    const container = playerContainerRef.current;
    if (!container || isMobile) return;
    const handleMouseMove = () => {
        dispatch({ type: 'SET_STATE', payload: { showControls: true } });
        if (inactivityTimer.current) window.clearTimeout(inactivityTimer.current);
        inactivityTimer.current = window.setTimeout(() => {
            if (state.isPlaying) {
                dispatch({ type: 'SET_STATE', payload: { showControls: false } });
            }
        }, 3000);
    };
    const handleMouseLeave = () => {
        if (state.isPlaying) {
            dispatch({ type: 'SET_STATE', payload: { showControls: false } });
        }
    };
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);
    if (!state.isPlaying) {
        dispatch({ type: 'SET_STATE', payload: { showControls: true } });
        if (inactivityTimer.current) window.clearTimeout(inactivityTimer.current);
    }
    return () => {
        if (container) {
            container.removeEventListener('mousemove', handleMouseMove);
            container.removeEventListener('mouseleave', handleMouseLeave);
        }
        if (inactivityTimer.current) window.clearTimeout(inactivityTimer.current);
    };
  }, [state.isPlaying, isMobile]);

  useEffect(() => {
    const handleFullscreenChange = () => dispatch({ type: 'SET_STATE', payload: { isFullscreen: !!document.fullscreenElement } });
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    let styleElement = document.getElementById('subtitle-style-override') as HTMLStyleElement;
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'subtitle-style-override';
      document.head.appendChild(styleElement);
    }
    styleElement.innerHTML = `
      video::cue {
        font-size: ${state.subtitleFontSize}rem !important;
        bottom: ${Math.abs(state.subtitlePosition)}% !important;
      }
    `;
  }, [state.subtitleFontSize, state.subtitlePosition]);

  useEffect(() => {
    const handleDocumentMouseMove = (e: MouseEvent) => {
      if (!state.isScrubbing || !videoRef.current || !progressBarRef.current || !state.duration) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const scrubTime = percent * state.duration;
      videoRef.current.currentTime = scrubTime;
      dispatch({ type: 'SET_STATE', payload: { currentTime: scrubTime, hoverTime: { time: scrubTime, position: e.clientX - rect.left } } });
    };
    const handleDocumentMouseUp = () => {
      if (state.isScrubbing) {
        dispatch({ type: 'SET_STATE', payload: { isScrubbing: false, hoverTime: { time: 0, position: null } } });
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
  }, [state.isScrubbing, state.duration]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    const handleTracksChange = () => {
        const tracks = Array.from(videoElement.textTracks);
        dispatch({ type: 'SET_SUBTITLE_TRACKS', payload: tracks });
        if (state.activeSubtitleTrack === null && tracks.length > 0) {
            const englishTrack = tracks.find(t => t.language === 'en' || t.label === 'English');
            const trackToActivate = englishTrack || tracks[0];
            dispatch({ type: 'SET_ACTIVE_SUBTITLE_TRACK', payload: trackToActivate.language || trackToActivate.label });
            tracks.forEach(t => t.mode = (t === trackToActivate) ? 'showing' : 'hidden');
        }
    };
    videoElement.textTracks.addEventListener('addtrack', handleTracksChange);
    videoElement.textTracks.addEventListener('removetrack', handleTracksChange);
    handleTracksChange();
    return () => {
        if (videoElement) {
            videoElement.textTracks.removeEventListener('addtrack', handleTracksChange);
            videoElement.textTracks.removeEventListener('removetrack', handleTracksChange);
        }
    };
  }, [state.activeSubtitleTrack, state.selectedLink]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
        videoRef.current.play().catch(() => dispatch({ type: 'SET_STATE', payload: { autoplayBlocked: true } }));
    } else {
        videoRef.current.pause();
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const newVolume = parseFloat(e.target.value);
    videoRef.current.volume = newVolume;
    videoRef.current.muted = newVolume === 0;
    dispatch({ type: 'SET_STATE', payload: { volume: newVolume, isMuted: newVolume === 0 } });
    localStorage.setItem('playerVolume', newVolume.toString());
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const newMuted = !videoRef.current.muted;
    videoRef.current.muted = newMuted;
    dispatch({ type: 'SET_STATE', payload: { isMuted: newMuted } });
    if (!newMuted && state.volume === 0) {
        const newVolume = 0.5;
        videoRef.current.volume = newVolume;
        dispatch({ type: 'SET_STATE', payload: { volume: newVolume } });
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

  const handleEpisodeClick = (ep: string) => navigate(`/player/${showId}/${ep}`);

  const toggleWatchlist = async () => {
    if (!state.showMeta || !showId) return;
    try {
      const endpoint = state.inWatchlist ? '/api/watchlist/remove' : '/api/watchlist/add';
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: showId, name: state.showMeta.name, thumbnail: state.showMeta.thumbnail })
      });
      dispatch({ type: 'SET_STATE', payload: { inWatchlist: !state.inWatchlist } });
    } catch (e) {
      console.error("Error toggling watchlist:", e);
    }
  };

  const seek = (seconds: number) => {
    if (videoRef.current) videoRef.current.currentTime += seconds;
  };

  const handleResume = () => {
    if (videoRef.current) {
        videoRef.current.currentTime = state.resumeTime;
        videoRef.current.play();
    }
    dispatch({ type: 'SET_STATE', payload: { showResumeModal: false } });
  };

  const handleStartOver = () => {
    if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play();
    }
    dispatch({ type: 'SET_STATE', payload: { showResumeModal: false } });
  };

  const handleSubtitleSelection = (trackId: string | null) => {
    if (!videoRef.current) return;
    dispatch({ type: 'SET_ACTIVE_SUBTITLE_TRACK', payload: trackId });
    Array.from(videoRef.current.textTracks).forEach(track => {
      track.mode = (trackId !== null && (track.language === trackId || track.label === trackId)) ? 'showing' : 'hidden';
    });
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !progressBarRef.current || isNaN(state.duration) || state.duration === 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    videoRef.current.currentTime = percent * state.duration;
  };

  const handleProgressBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !state.duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const time = percent * state.duration;
    dispatch({ type: 'SET_STATE', payload: { hoverTime: { time, position: e.clientX - rect.left } } });
  };

  const handleThumbMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!videoRef.current) return;
    dispatch({ type: 'SET_STATE', payload: { isScrubbing: true } });
    wasPlayingBeforeScrub.current = !videoRef.current.paused;
    videoRef.current.pause();
  };

  const renderVolumeIcon = () => {
    if (state.isMuted) return <FaVolumeMute />;
    if (state.volume === 0) return <FaVolumeOff />;
    if (state.volume < 0.5) return <FaVolumeDown />;
    return <FaVolumeUp />;
  };

  if (state.loadingShowData) return <p className="loading">Loading show data...</p>;
  if (state.error) return <p className="error-message">Error: {state.error}</p>;
  if (!state.showMeta.name) return <p>Show not found.</p>;

  return (
    <div className={styles.playerPage}>
        <ResumeModal 
            show={state.showResumeModal}
            resumeTime={formatTime(state.resumeTime)}
            onResume={handleResume}
            onStartOver={handleStartOver}
        />
      <div className={styles.headerContainer}>
        <img src={fixThumbnailUrl(state.showMeta.thumbnail!)} alt={state.showMeta.name} className={styles.headerThumbnail} />
        <div className={styles.header}>
          <div className={styles.titleContainer}>
            <h2>{state.showMeta.name}</h2>
            {(state.showMeta.status || state.showMeta.nextEpisodeAirDate) && (
              <div className={styles.scheduleInfo}>
                {state.showMeta.status && <span className={styles.status}>{state.showMeta.status}</span>}
                {state.showMeta.nextEpisodeAirDate && <span className={styles.nextEpisode}>Next: {state.showMeta.nextEpisodeAirDate}</span>}
              </div>
            )}
          </div>
          <div className={styles.controls}>
              <button className={styles.watchlistBtn} onClick={() => navigate('/settings')}>Settings</button>
              <button className={`${styles.watchlistBtn} ${state.inWatchlist ? styles.inList : ''}`} onClick={toggleWatchlist}>
                {state.inWatchlist ? <FaCheck /> : <FaPlus />}
                {state.inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
              </button>
              <div className={styles.toggleContainer}>
                  <span>SUB</span>
                  <ToggleSwitch 
                      id="dub-toggle"
                      isChecked={state.currentMode === 'dub'} 
                      onChange={() => dispatch({ type: 'SET_STATE', payload: { currentMode: state.currentMode === 'sub' ? 'dub' : 'sub' } })} 
                  />
                  <span>DUB</span>
              </div>
          </div>
        </div>
      </div>

      <div className={styles.descriptionBox}>
        <h3>Description</h3>
        <p dangerouslySetInnerHTML={{ __html: state.showMeta.description || 'No description available.' }}></p>
      </div>

      <div className={styles.detailsBox}>
        <button className={styles.detailsToggle} onClick={() => dispatch({ type: 'SET_STATE', payload: { showCombinedDetails: !state.showCombinedDetails } })}>
          <h3>Details</h3>
          {state.showCombinedDetails ? <FaChevronUp /> : <FaChevronDown />}
        </button>
        {state.showCombinedDetails && (
          <div className={styles.detailsGridContainer}>
            <div className={styles.detailItem}><strong>Type:</strong> {state.showMeta.mediaTypes?.[0]?.name}</div>
            <div className={styles.detailItem}><strong>Status:</strong> {state.showMeta.status}</div>
            <div className={styles.detailItem}><strong>Score:</strong> {state.showMeta.stats ? state.showMeta.stats.averageScore / 10 : 'N/A'}</div>
            <div className={styles.detailItem}><strong>Studios:</strong> {state.showMeta.studios?.map(s => s.name).join(', ')}</div>
            <div className={styles.detailItem}><strong>English Title:</strong> {state.showMeta.names?.english}</div>
            <div className={styles.detailItem}><strong>Native Title:</strong> {state.showMeta.names?.native}</div>
            {state.showMeta.genres && state.showMeta.genres.length > 0 && (
              <div className={`${styles.detailItem} ${styles.genresContainer}`}>
                <strong>Genres:</strong>
                <div className={styles.genresList}>
                  {state.showMeta.genres.map(genre => <span key={genre.route} className={styles.genreTag}>{genre.name}</span>)}
                </div>
              </div>
            )}
            {state.allMangaDetails && (
              <>
                <div className={styles.detailItem}><strong>Rating:</strong> {state.allMangaDetails.Rating}</div>
                <div className={styles.detailItem}><strong>Season:</strong> {state.allMangaDetails.Season}</div>
                <div className={styles.detailItem}><strong>Episodes:</strong> {state.allMangaDetails.Episodes}</div>
                <div className={styles.detailItem}><strong>Date:</strong> {state.allMangaDetails.Date}</div>
                <div className={styles.detailItem}><strong>Original Broadcast:</strong> {state.allMangaDetails["Original Broadcast"]}</div>
              </>
            )}
          </div>
        )}
      </div>

      <div ref={playerContainerRef} className={styles.videoContainer} onDoubleClick={toggleFullscreen}>
        {state.loadingVideo && <p className="loading">Loading video...</p>}
        
        {!isMobile && <div className={`${styles.controlsOverlay} ${!state.showControls ? styles.hidden : ''}`} onDoubleClick={(e) => e.stopPropagation()}>
            {!state.isPlaying && (
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
                    onMouseLeave={() => dispatch({ type: 'SET_STATE', payload: { hoverTime: { time: 0, position: null } } })}
                >
                    {state.hoverTime.position !== null && (
                        <div className={styles.timeBubble} style={{ left: state.hoverTime.position }}>
                            {formatTime(state.hoverTime.time)}
                        </div>
                    )}
                    <div className={styles.progressBar}>
                        {state.duration > 0 && state.skipIntervals.map((interval, index) => (
                            <div
                                key={index}
                                className={`${styles.skipSegment} ${styles[interval.skip_type]}`}
                                style={{
                                    left: `${(interval.start_time / state.duration) * 100}%`,
                                    width: `${((interval.end_time - interval.start_time) / state.duration) * 100}%`,
                                }}
                            ></div>
                        ))}
                        <div className={styles.bufferedBar} style={{ width: `${(state.buffered / state.duration) * 100 || 0}%` }}></div>
                        <div className={styles.watchedBar} style={{ width: `${(state.currentTime / state.duration) * 100 || 0}%` }}></div>
                        <div
                            className={styles.thumb}
                            style={{ left: `${(state.currentTime / state.duration) * 100 || 0}%` }}
                            onMouseDown={handleThumbMouseDown}
                        ></div>
                    </div>
                </div>
                <div className={styles.bottomControlsRow}>
                    <div className={styles.leftControls}>
                        <button className={styles.controlBtn} onClick={togglePlay}>{state.isPlaying ? <FaPause /> : <FaPlay />}</button>
                        <div className={styles.volumeContainer}>
                            <button className={styles.controlBtn} onClick={toggleMute}>{renderVolumeIcon()}</button>
                            <input 
                                type="range" 
                                min="0" 
                                max="1" 
                                step="0.05" 
                                value={state.isMuted ? 0 : state.volume}
                                onChange={handleVolumeChange}
                                className={styles.volumeSlider}
                            />
                        </div>
                        <span className={styles.timeDisplay}>{formatTime(state.currentTime)} / {formatTime(state.duration)}</span>
                        {state.currentSkipInterval && !state.isAutoSkipEnabled && (
                            <button className={styles.controlBtn} onClick={() => {
                                if (videoRef.current && state.currentSkipInterval) {
                                    videoRef.current.currentTime = state.currentSkipInterval.end_time;
                                    dispatch({ type: 'SET_STATE', payload: { currentSkipInterval: null } });
                                }
                            }}>
                                Skip {state.currentSkipInterval.skip_type === 'op' ? 'Opening' : 'Ending'}
                            </button>
                        )}
                    </div>
                    <div className={styles.rightControls}>
                        <div className={styles.middleControls}>
                            <button className={styles.controlBtn} onClick={() => seek(-10)}>
                                <svg width="36" height="36" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" strokeWidth="3" stroke="currentColor" fill="none"><path strokeLinecap="round" strokeLinejoin="round" d="M34 52h18V16H24"/><path strokeLinecap="round" d="M24 16H8"/><path strokeLinecap="round" strokeLinejoin="round" d="m11.5 12-4 4 4 4"/><text x="3" y="53" fontSize="28" fill="currentColor" stroke="none">10</text></svg>
                            </button>
                            <button className={styles.controlBtn} onClick={() => seek(10)}>
                                <svg width="36" height="36" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" strokeWidth="3" stroke="currentColor" fill="none"><path strokeLinecap="round" strokeLinejoin="round" d="M30 52H12V16h28"/><path strokeLinecap="round" d="M40 16h16"/><path strokeLinecap="round" strokeLinejoin="round" d="m52 12 4.5 4-4.5 4"/><text x="29" y="53.5" fontSize="28" fill="currentColor" stroke="none">10</text></svg>
                            </button>
                        </div>
                        <div className={styles.toggleContainer}>
                            <span>Auto Skip</span>
                            <ToggleSwitch id="auto-skip-toggle" isChecked={state.isAutoSkipEnabled} onChange={(e) => {
                                const checked = e.target.checked;
                                dispatch({ type: 'SET_STATE', payload: { isAutoSkipEnabled: checked } });
                                localStorage.setItem('autoSkipEnabled', checked.toString());
                            }} />
                        </div>
                        <div className={styles.toggleContainer}>
                            <span>Autoplay</span>
                            <ToggleSwitch id="autoplay-toggle" isChecked={state.isAutoplayEnabled} onChange={(e) => {
                                const checked = e.target.checked;
                                dispatch({ type: 'SET_STATE', payload: { isAutoplayEnabled: checked } });
                                localStorage.setItem('autoplayEnabled', checked.toString());
                            }} />
                        </div>
                        <div className={styles.ccMenuContainer}>
                            <button className={styles.controlBtn} onClick={() => dispatch({ type: 'SET_STATE', payload: { showCCMenu: !state.showCCMenu } })}><FaClosedCaptioning /></button>
                            {state.showCCMenu && (
                                <div className={styles.settingsMenu} onClick={e => e.stopPropagation()}>
                                    <h4>Subtitles</h4>
                                    <div className={styles.ccOptionsContainer}>
                                        {state.availableSubtitles.length > 0 && <button key="off" className={`${styles.ccItem} ${state.activeSubtitleTrack === null ? styles.active : ''}`} onClick={() => handleSubtitleSelection(null)}>Off</button>}
                                        {state.availableSubtitles.map(track => (<button key={track.language || track.label} className={`${styles.ccItem} ${state.activeSubtitleTrack === (track.language || track.label) ? styles.active : ''}`} onClick={() => handleSubtitleSelection(track.language || track.label)}>{track.label || track.language}</button>))}
                                        {state.availableSubtitles.length === 0 && <button className={`${styles.ccItem} ${styles.disabled}`}>Not Available</button>}
                                    </div>
                                    <div className={styles.ccDivider}></div>
                                    <h4>Subtitle Settings</h4>
                                    <div className={styles.ccSliderContainer}>
                                        <label htmlFor="fontSizeSlider">Font Size</label>
                                        <input type="range" id="fontSizeSlider" min="1" max="3" step="0.1" value={state.subtitleFontSize} onChange={(e) => {
                                            const value = parseFloat(e.target.value);
                                            dispatch({ type: 'SET_STATE', payload: { subtitleFontSize: value } });
                                            localStorage.setItem('subtitleFontSize', value.toString());
                                        }}/>
                                        <span>{state.subtitleFontSize.toFixed(1)}</span>
                                    </div>
                                    <div className={styles.ccSliderContainer}>
                                        <label htmlFor="positionSlider">Position</label>
                                        <input type="range" id="positionSlider" min="-10" max="0" step="1" value={state.subtitlePosition} onChange={(e) => {
                                            const value = parseInt(e.target.value, 10);
                                            dispatch({ type: 'SET_STATE', payload: { subtitlePosition: value } });
                                            localStorage.setItem('subtitlePosition', value.toString());
                                        }}/>
                                        <span>{state.subtitlePosition}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className={styles.sourceMenuContainer}>
                            <button className={styles.controlBtn} onClick={() => dispatch({ type: 'SET_STATE', payload: { showSourceMenu: !state.showSourceMenu } })}><FaList /></button>
                            {state.showSourceMenu && (
                                <div className={styles.settingsMenu} onClick={e => e.stopPropagation()}>
                                    <h4>Sources & Quality</h4>
                                    {state.videoSources.map(source => (
                                        <div key={source.sourceName} className={styles.sourceGroupInMenu}>
                                            <h5>{source.sourceName}</h5>
                                            <div className={styles.qualityListInMenu}>
                                                {source.links.sort((a, b) => (parseInt(b.resolutionStr) || 0) - (parseInt(a.resolutionStr) || 0)).map(link => (
                                                    <button
                                                        key={link.resolutionStr}
                                                        className={`${styles.qualityItemInMenu} ${state.selectedSource?.sourceName === source.sourceName && state.selectedLink?.resolutionStr === link.resolutionStr ? styles.active : ''}`}
                                                        onClick={() => dispatch({ type: 'SET_STATE', payload: { selectedSource: source, selectedLink: link, showSourceMenu: false } })}
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
                        <button className={styles.controlBtn} onClick={toggleFullscreen}>{state.isFullscreen ? <FaCompress /> : <FaExpand />}</button>
                    </div>
                </div>
            </div>
        </div>}

        <video 
            ref={videoRef} 
            controls={isMobile}
            onClick={!isMobile ? togglePlay : undefined}
            onPlay={() => dispatch({ type: 'SET_PLAY_STATUS', payload: true })}
            onPause={() => dispatch({ type: 'SET_PLAY_STATUS', payload: false })}
            onLoadedMetadata={() => {
                dispatch({ type: 'SET_VIDEO_ELEMENT_STATE', payload: { duration: videoRef.current?.duration || 0 } });
                if (state.isAutoplayEnabled && videoRef.current) {
                    videoRef.current.play()
                        .then(() => dispatch({ type: 'SET_STATE', payload: { autoplayBlocked: false } }))
                        .catch(() => dispatch({ type: 'SET_STATE', payload: { autoplayBlocked: true } }));
                }
            }}
            onTimeUpdate={() => {
                const currentTime = videoRef.current?.currentTime || 0;
                if (!state.isScrubbing) {
                    dispatch({ type: 'SET_VIDEO_ELEMENT_STATE', payload: { currentTime } });
                }
                const activeSkip = state.skipIntervals.find(interval => currentTime >= interval.start_time && currentTime < interval.end_time);
                dispatch({ type: 'SET_STATE', payload: { currentSkipInterval: activeSkip || null } });
                if (state.isAutoSkipEnabled && activeSkip && videoRef.current && !videoRef.current.paused) {
                    videoRef.current.currentTime = activeSkip.end_time;
                    dispatch({ type: 'SET_STATE', payload: { currentSkipInterval: null } });
                }
            }}
            onProgress={() => {
                if (videoRef.current && videoRef.current.buffered.length > 0) {
                    dispatch({ type: 'SET_VIDEO_ELEMENT_STATE', payload: { buffered: videoRef.current.buffered.end(videoRef.current.buffered.length - 1) } });
                }
            }}
            onVolumeChange={() => {
                if (videoRef.current) {
                    dispatch({ type: 'SET_VIDEO_ELEMENT_STATE', payload: { isMuted: videoRef.current.muted, volume: videoRef.current.volume } });
                }
            }}
        />
      </div>

      {isMobile && (
        <div className={styles.mobileControls}>
            <div className={styles.playerActions}>
                <button className={styles.seekBtn} onClick={() => seek(-10)}>-10s</button>
                <button className={styles.seekBtn} onClick={() => seek(10)}>+10s</button>
                <div className={styles.toggleContainer}>
                    <span>Auto Skip</span>
                    <ToggleSwitch id="auto-skip-toggle-mobile" isChecked={state.isAutoSkipEnabled} onChange={(e) => {
                        const checked = e.target.checked;
                        dispatch({ type: 'SET_STATE', payload: { isAutoSkipEnabled: checked } });
                        localStorage.setItem('autoSkipEnabled', checked.toString());
                    }} />
                </div>
                <div className={styles.toggleContainer}>
                    <span>Autoplay</span>
                    <ToggleSwitch id="autoplay-toggle-mobile" isChecked={state.isAutoplayEnabled} onChange={(e) => {
                        const checked = e.target.checked;
                        dispatch({ type: 'SET_STATE', payload: { isAutoplayEnabled: checked } });
                        localStorage.setItem('autoplayEnabled', checked.toString());
                    }} />
                </div>
            </div>
            <div className={styles.sourceQualityControls}>
                <div className={styles.sourceSelection}>
                    <h4>Source</h4>
                    <div className={styles.sourceButtons}>
                        {state.videoSources.map(source => (
                            <button
                                key={source.sourceName}
                                className={`${styles.sourceButton} ${state.selectedSource?.sourceName === source.sourceName ? styles.active : ''}`}
                                onClick={() => dispatch({ type: 'SET_STATE', payload: { selectedSource: source } })}
                            >
                                {source.sourceName}
                            </button>
                        ))}
                    </div>
                </div>
                {state.selectedSource && (
                    <div className={styles.qualitySelection}>
                        <h4>Quality</h4>
                        <div className={styles.qualityButtons}>
                            {state.selectedSource.links.sort((a, b) => (parseInt(b.resolutionStr) || 0) - (parseInt(a.resolutionStr) || 0)).map(link => (
                                <button
                                    key={link.resolutionStr}
                                    className={`${styles.qualityButton} ${state.selectedLink?.resolutionStr === link.resolutionStr ? styles.active : ''}`}
                                    onClick={() => dispatch({ type: 'SET_STATE', payload: { selectedLink: link } })}
                                >
                                    {link.resolutionStr}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
      )}

      <div className={styles.contentLayout}>
        <div className={styles.episodeListContainer}>
            <h3>Episodes ({state.currentMode.toUpperCase()})</h3>
            <div className={styles.episodeList}>
                {state.episodes.map(ep => (
                <button
                    key={ep}
                    data-episode={ep}
                    className={`${styles.episodeItem} ${state.watchedEpisodes.includes(ep) ? styles.watched : ''} ${ep === state.currentEpisode ? styles.active : ''}`}
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