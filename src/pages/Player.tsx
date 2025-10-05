import React, { useEffect, useReducer, useRef, useCallback, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styles from './Player.module.css';
import ToggleSwitch from '../components/common/ToggleSwitch';
import { FaCheck, FaPlus, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { fixThumbnailUrl } from '../lib/utils';
import ResumeModal from '../components/common/ResumeModal';
import useIsMobile from '../hooks/useIsMobile';
import Hls from 'hls.js';
import { useTitlePreference } from '../contexts/TitlePreferenceContext';
import PlayerControls from '../components/player/PlayerControls';
import EpisodeList from '../components/player/EpisodeList';
import SourceSelector from '../components/player/SourceSelector';
import ShowDetails from '../components/player/ShowDetails';
import useVideoPlayer from '../hooks/useVideoPlayer';

interface SimpleShowMeta {
  name: string;
  thumbnail: string;
  description?: string;
  names?: {
    romaji: string;
    english: string;
    native: string;
  };
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

export interface VideoLink {
  resolutionStr: string;
  link: string;
  hls: boolean;
  headers?: { Referer?: string };
}

export interface SubtitleTrack {
  src: string;
  lang: string;
  label: string;
}

export interface VideoSource {
  sourceName: string;
  links: VideoLink[];
  subtitles?: SubtitleTrack[];
  type?: 'player' | 'iframe';
  sandbox?: string;
}

export interface SkipInterval {
  start_time: number;
  end_time: number;
  skip_type: 'op' | 'ed' | 'recap' | 'mixed_op' | 'mixed_ed' | 'mixed_recap';
  skip_id: string;
}

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
  skipIntervals: SkipInterval[];
  loadingShowData: boolean;
  loadingVideo: boolean;
  loadingDetails: boolean;
  error: string | null;
  detailsError: string | null;
}

type Action =
  | { type: 'SET_STATE'; payload: Partial<PlayerState> }
  | { type: 'SET_LOADING'; key: 'loadingShowData' | 'loadingVideo' | 'loadingDetails'; value: boolean }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'SHOW_DATA_SUCCESS'; payload: Partial<PlayerState> }
  | { type: 'VIDEO_DATA_SUCCESS'; payload: Partial<PlayerState> };

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
  skipIntervals: [],
  loadingShowData: true,
  loadingVideo: false,
  loadingDetails: false,
  error: null,
  detailsError: null,
};

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
    default:
      return state;
  }
}

const Player: React.FC = () => {
  const { id: showId, episodeNumber } = useParams<{ id: string; episodeNumber?: string }>();
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(playerReducer, initialState);
  const player = useVideoPlayer(state.skipIntervals);
  const { refs, actions } = player;

  const hlsInstance = useRef<Hls | null>(null);
  const isMobile = useIsMobile();

  const fetchWithProfile = async (url: string, options: RequestInit = {}) => {
    const newOptions: RequestInit = { ...options };
    if (newOptions.body && typeof newOptions.body === 'string') {
        newOptions.headers = { ...newOptions.headers, 'Content-Type': 'application/json' };
    }
    return fetch(url, newOptions);
  };

  useEffect(() => {
    const fetchInitialData = async () => {
      if (!showId) return;
      dispatch({ type: 'SET_LOADING', key: 'loadingShowData', value: true });
      try {
        const [metaResponse, episodesResponse, watchlistResponse, watchedResponse] = await Promise.all([
          fetch(`/api/show-meta/${showId}`),
          fetch(`/api/episodes?showId=${showId}&mode=${state.currentMode}`),
          fetchWithProfile(`/api/watchlist/check/${showId}`),
          fetchWithProfile(`/api/watched-episodes/${showId}`),
        ]);

        if (!metaResponse.ok) throw new Error("Failed to fetch show metadata");
        if (!episodesResponse.ok) throw new Error("Failed to fetch episodes");

        const meta = await metaResponse.json();
        const episodeData = await episodesResponse.json();
        const watchlistStatus = watchlistResponse.ok ? await watchlistResponse.json() : { inWatchlist: false };
        const watchedData = watchedResponse.ok ? await watchedResponse.json() : [];

        dispatch({
          type: 'SHOW_DATA_SUCCESS',
          payload: {
            showMeta: { ...meta, description: episodeData.description, names: meta.names || { romaji: meta.name, english: meta.englishName, native: meta.nativeName } },
            episodes: episodeData.episodes.sort((a: string, b: string) => parseFloat(a) - parseFloat(b)),
            inWatchlist: watchlistStatus.inWatchlist,
            watchedEpisodes: watchedData,
            currentEpisode: episodeNumber || (episodeData.episodes.length > 0 ? episodeData.episodes[0] : undefined),
          },
        });
      } catch (e) {
        dispatch({ type: 'SET_ERROR', payload: e instanceof Error ? e.message : 'An unknown error occurred' });
      }
    };
    fetchInitialData();
  }, [showId, state.currentMode, episodeNumber]);

  const handleToggleDetails = useCallback(async () => {
    dispatch({ type: 'SET_STATE', payload: { showCombinedDetails: !state.showCombinedDetails } });

    if (state.showCombinedDetails || state.showMeta.status) {
      return;
    }

    try {
      dispatch({ type: 'SET_LOADING', key: 'loadingDetails', value: true });
      dispatch({ type: 'SET_STATE', payload: { detailsError: null } });

      const [detailsResponse, allmangaDetailsResponse] = await Promise.all([
        fetch(`/api/show-details/${showId}`),
        fetch(`/api/allmanga-details/${showId}`),
      ]);

      if (!detailsResponse.ok) throw new Error("Failed to fetch show details");

      const details = await detailsResponse.json();
      const allmangaDetails = allmangaDetailsResponse.ok ? await allmangaDetailsResponse.json() : null;

      dispatch({
        type: 'SET_STATE',
        payload: {
          showMeta: { ...state.showMeta, ...details },
          allMangaDetails: allmangaDetails,
          loadingDetails: false,
        },
      });
    } catch (e) {
      dispatch({
        type: 'SET_STATE',
        payload: {
          detailsError: e instanceof Error ? e.message : 'Failed to load details',
          loadingDetails: false
        }
      });
    }
  }, [showId, state.showCombinedDetails, state.showMeta]);

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
          fetchWithProfile(`/api/settings?key=preferredSource`),
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
    const videoElement = refs.videoRef.current;
    if (!videoElement) return;

    if (hlsInstance.current) {
      hlsInstance.current.destroy();
    }
    videoElement.pause();
    videoElement.removeAttribute('src');
    videoElement.load();
    
    while (videoElement.firstChild) {
      videoElement.removeChild(videoElement.firstChild);
    }

    if (!state.selectedSource || !state.selectedLink) return;

    if (state.selectedSource.type === 'iframe') {
        return;
    }

    let proxiedUrl = `/api/proxy?url=${encodeURIComponent(state.selectedLink.link)}`;
    if (state.selectedLink.headers?.Referer) {
        proxiedUrl += `&referer=${encodeURIComponent(state.selectedLink.headers.Referer)}`;
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
    }
    if (savedMuted !== null) {
      const newMuted = savedMuted === 'true';
      videoElement.muted = newMuted;
    }

    videoElement.play().catch(error => {
        console.warn("Autoplay was prevented:", error);
        actions.setShowControls(true);
    });

    return () => {
      if (hlsInstance.current) {
        hlsInstance.current.destroy();
      }
    };
  }, [state.selectedSource, state.selectedLink, setPreferredSource, refs.videoRef, actions]);



  useEffect(() => {
    const videoElement = refs.videoRef.current;
    if (!videoElement || !showId || !state.currentEpisode || !state.showMeta.name) return;

    let interval: NodeJS.Timeout;

    const updateProgress = () => {
        if (isNaN(videoElement.duration) || videoElement.duration === 0) return;
        const episodeCount = state.showMeta.episodes || 0;
        fetchWithProfile('/api/update-progress', {
            method: 'POST',
            body: JSON.stringify({
                showId,
                episodeNumber: state.currentEpisode,
                currentTime: videoElement.currentTime,
                duration: videoElement.duration,
                showName: state.showMeta.name,
                showThumbnail: fixThumbnailUrl(state.showMeta.thumbnail!),
                nativeName: state.showMeta.names?.native,
                englishName: state.showMeta.names?.english,
                episodeCount: episodeCount
            })
        });
    };

    if (player.state.isPlaying) {
        interval = setInterval(updateProgress, 5000);
    }

    return () => {
        if (interval) {
            clearInterval(interval);
        }
    };
  }, [showId, state.currentEpisode, state.showMeta, refs.videoRef, player.state.isPlaying]);

  useEffect(() => {
    const videoElement = refs.videoRef.current;
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
  }, [state.isAutoplayEnabled, state.episodes, state.currentEpisode, showId, navigate, refs.videoRef]);

  useEffect(() => {
    const container = player.refs.playerContainerRef.current;
    if (!container || isMobile) return;
    const handleMouseMove = () => {
        actions.setShowControls(true);
        if (player.actions.inactivityTimer.current) window.clearTimeout(player.actions.inactivityTimer.current);
        if (player.state.isPlaying) {
            player.actions.inactivityTimer.current = window.setTimeout(() => {
                actions.setShowControls(false);
            }, 3000);
        }
    };
    const handleMouseLeave = () => {
        if (player.state.isPlaying) {
            actions.setShowControls(false);
        }
        if (player.actions.inactivityTimer.current) window.clearTimeout(player.actions.inactivityTimer.current);
    };
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);
    if (!player.state.isPlaying) {
        actions.setShowControls(true);
        if (player.actions.inactivityTimer.current) window.clearTimeout(player.actions.inactivityTimer.current);
    }
    return () => {
        if (container) {
            container.removeEventListener('mousemove', handleMouseMove);
            container.removeEventListener('mouseleave', handleMouseLeave);
        }
        if (player.actions.inactivityTimer.current) window.clearTimeout(player.actions.inactivityTimer.current);
    };
  }, [player.state.isPlaying, isMobile, player.refs.playerContainerRef, player.actions]);

  const { setIsFullscreen } = actions;

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [setIsFullscreen]);

  const { setAvailableSubtitles } = actions;

  useEffect(() => {
    const videoElement = refs.videoRef.current;
    if (!videoElement) return;

    const handleTracksChange = () => {
        setAvailableSubtitles(Array.from(videoElement.textTracks));
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
  }, [refs.videoRef, setAvailableSubtitles]);

  const { setActiveSubtitleTrack } = actions;

  useEffect(() => {
    if (player.state.activeSubtitleTrack === null && player.state.availableSubtitles.length > 0) {
        const englishTrack = player.state.availableSubtitles.find(t => t.language === 'en' || t.label === 'English');
        const trackToActivate = englishTrack || player.state.availableSubtitles[0];
        setActiveSubtitleTrack(trackToActivate.language || trackToActivate.label);
        player.state.availableSubtitles.forEach(t => t.mode = (t === trackToActivate) ? 'showing' : 'hidden');
    }
  }, [player.state.activeSubtitleTrack, player.state.availableSubtitles, setActiveSubtitleTrack]);

  const handleEpisodeClick = (ep: string) => navigate(`/player/${showId}/${ep}`);

  const toggleWatchlist = async () => {
    if (!state.showMeta || !showId) return;
    try {
      const endpoint = state.inWatchlist ? '/api/watchlist/remove' : '/api/watchlist/add';
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: showId, name: state.showMeta.name, thumbnail: state.showMeta.thumbnail, nativeName: state.showMeta.names?.native, englishName: state.showMeta.names?.english })
      });
      dispatch({ type: 'SET_STATE', payload: { inWatchlist: !state.inWatchlist } });
    } catch (e) {
      console.error("Error toggling watchlist:", e);
    }
  };

  const handleResume = () => {
    if (refs.videoRef.current) {
        refs.videoRef.current.currentTime = state.resumeTime;
        refs.videoRef.current.play();
    }
    dispatch({ type: 'SET_STATE', payload: { showResumeModal: false } });
  };

  const handleStartOver = () => {
    if (refs.videoRef.current) {
        refs.videoRef.current.currentTime = 0;
        refs.videoRef.current.play();
    }
    dispatch({ type: 'SET_STATE', payload: { showResumeModal: false } });
  };

  const handleAutoplayChange = (checked: boolean) => {
      dispatch({ type: 'SET_STATE', payload: { isAutoplayEnabled: checked } });
      localStorage.setItem('autoplayEnabled', checked.toString());
  };

  const { titlePreference } = useTitlePreference();

  const displayTitle = useMemo(() => {
    if (!state.showMeta) return 'Loading...';
    if (titlePreference === 'name') return state.showMeta.name;
    if (titlePreference === 'nativeName') return state.showMeta.names?.native || state.showMeta.name;
    if (titlePreference === 'englishName') return state.showMeta.names?.english || state.showMeta.name;
    return state.showMeta.name;
  }, [state.showMeta, titlePreference]);

  if (state.loadingShowData) return <p className="loading">Loading show data...</p>;
  if (state.error) return <p className="error-message">Error: {state.error}</p>;
  if (!state.showMeta.name) return <p>Show not found.</p>;

  return (
    <div className={styles.playerPage}>
        <ResumeModal 
            show={state.showResumeModal}
            resumeTime={player.actions.formatTime(state.resumeTime)}
            onResume={handleResume}
            onStartOver={handleStartOver}
        />
      <div className={styles.headerContainer}>
        <img src={fixThumbnailUrl(state.showMeta.thumbnail!)} alt={displayTitle} className={styles.headerThumbnail} />
        <div className={styles.header}>
          <div className={styles.titleContainer}>
            <h2>{displayTitle}</h2>
            {(state.showMeta.status || state.showMeta.nextEpisodeAirDate) && (
              <div className={styles.scheduleInfo}>
                {state.showMeta.status && <span className={styles.status}>{state.showMeta.status}</span>}
                {state.showMeta.nextEpisodeAirDate && <span className={styles.nextEpisode}>Next: {state.showMeta.nextEpisodeAirDate}</span>}
              </div>
            )}
          </div>
          <div className={styles.controls}>

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

      <ShowDetails
        showMeta={state.showMeta}
        allMangaDetails={state.allMangaDetails}
        loading={state.loadingDetails}
        error={state.detailsError}
        isOpen={state.showCombinedDetails}
        onToggle={handleToggleDetails}
      />

      <div ref={refs.playerContainerRef} className={styles.videoContainer} onDoubleClick={actions.toggleFullscreen}>
        {state.loadingVideo && (
            <div className={styles.loadingOverlay}>
                <div className={styles.loadingDots}>
                    <div className={styles.dot}></div>
                    <div className={styles.dot}></div>
                    <div className={styles.dot}></div>
                </div>
            </div>
        )}
        
        {state.selectedSource?.type === 'iframe' ? (
            !state.loadingVideo && <iframe
                src={state.selectedLink?.link}
                className={styles.videoIframe}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                sandbox={state.selectedSource.sandbox ? `${state.selectedSource.sandbox} allow-fullscreen allow-popups allow-popups-to-escape-sandbox` : undefined}
            ></iframe>
        ) : (
          <>
            {!state.loadingVideo && !isMobile && <PlayerControls 
                player={player}
                isAutoplayEnabled={state.isAutoplayEnabled}
                onAutoplayChange={handleAutoplayChange}
                videoSources={state.videoSources}
                selectedSource={state.selectedSource}
                selectedLink={state.selectedLink}
                onSourceChange={(source, link) => dispatch({ type: 'SET_STATE', payload: { selectedSource: source, selectedLink: link }})}
                loadingVideo={state.loadingVideo}
            />}

            {!state.loadingVideo && <video 
                ref={refs.videoRef} 
                controls={isMobile}
                onClick={!isMobile ? actions.togglePlay : undefined}
                onPlay={actions.onPlay}
                onPause={actions.onPause}
                onLoadedMetadata={actions.onLoadedMetadata}
                onTimeUpdate={actions.onTimeUpdate}
                onProgress={actions.onProgress}
                onVolumeChange={actions.onVolumeChange}
            />}
          </>
        )}
      </div>

      <SourceSelector 
        videoSources={state.videoSources}
        selectedSource={state.selectedSource}
        onSourceChange={(source) => {
          const bestLink = source.links.sort((a, b) => (parseInt(b.resolutionStr) || 0) - (parseInt(a.resolutionStr) || 0))[0];
          dispatch({ type: 'SET_STATE', payload: { selectedSource: source, selectedLink: bestLink } })
        }}
      />

      {isMobile && state.selectedSource?.type !== 'iframe' && (
        <div className={styles.mobileControls}>
            <div className={styles.playerActions}>
                <button className={styles.seekBtn} onClick={() => actions.seek(-10)}>-10s</button>
                <button className={styles.seekBtn} onClick={() => actions.seek(10)}>+10s</button>
                <div className={styles.toggleContainer}>
                    <span>Auto Skip</span>
                    <ToggleSwitch id="auto-skip-toggle-mobile" isChecked={player.state.isAutoSkipEnabled} onChange={(e) => {
                        const checked = e.target.checked;
                        actions.setIsAutoSkipEnabled(checked);
                        localStorage.setItem('autoSkipEnabled', checked.toString());
                    }} />
                </div>
                <div className={styles.toggleContainer}>
                    <span>Autoplay</span>
                    <ToggleSwitch id="autoplay-toggle-mobile" isChecked={state.isAutoplayEnabled} onChange={(e) => handleAutoplayChange(e.target.checked)} />
                </div>
            </div>
        </div>
      )}

      <div className={styles.contentLayout}>
        <EpisodeList 
            episodes={state.episodes}
            currentEpisode={state.currentEpisode}
            watchedEpisodes={state.watchedEpisodes}
            currentMode={state.currentMode}
            onEpisodeClick={handleEpisodeClick}
        />
      </div>
    </div>
  );
};

export default Player;