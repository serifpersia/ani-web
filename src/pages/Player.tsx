import React, { useEffect, useReducer, useRef, useCallback, useState, useMemo } from 'react';
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
  skipIntervals: SkipInterval[];
  loadingShowData: boolean;
  loadingVideo: boolean;
  loadingDetails: boolean;
  error: string | null;
}

type Action =
  | { type: 'SET_STATE'; payload: Partial<PlayerState> }
  | { type: 'SET_LOADING'; key: 'loadingShowData' | 'loadingVideo' | 'loadingDetails'; value: boolean }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'SHOW_DATA_SUCCESS'; payload: Partial<PlayerState> }
  | { type: 'VIDEO_DATA_SUCCESS'; payload: Partial<PlayerState> };


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
  skipIntervals: [],
  loadingShowData: true,
  loadingVideo: false,
  loadingDetails: false,
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
    default:
      return state;
  }
}

// --- CUSTOM HOOK: useVideoPlayer ---
const useVideoPlayer = (skipIntervals: SkipInterval[]) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const playerContainerRef = useRef<HTMLDivElement>(null);
    const progressBarRef = useRef<HTMLDivElement>(null);
    const inactivityTimer = useRef<number | null>(null);
    const wasPlayingBeforeScrub = useRef(false);

    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [showControls, setShowControls] = useState(true);
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [hoverTime, setHoverTime] = useState({ time: 0, position: null as number | null });
    const [isAutoSkipEnabled, setIsAutoSkipEnabled] = useState(localStorage.getItem('autoSkipEnabled') === 'true');
    const [currentSkipInterval, setCurrentSkipInterval] = useState<SkipInterval | null>(null);
    const [showCCMenu, setShowCCMenu] = useState(false);
    const [subtitleFontSize, setSubtitleFontSize] = useState(parseFloat(localStorage.getItem('subtitleFontSize') || '1.8'));
    const [subtitlePosition, setSubtitlePosition] = useState(parseInt(localStorage.getItem('subtitlePosition') || '-4'));
    const [availableSubtitles, setAvailableSubtitles] = useState<TextTrack[]>([]);
    const [activeSubtitleTrack, setActiveSubtitleTrack] = useState<string | null>(null);
    const [showSourceMenu, setShowSourceMenu] = useState(false);

    const togglePlay = useCallback(() => {
        if (!videoRef.current) return;
        if (videoRef.current.paused) {
            videoRef.current.play().catch(() => console.warn("Autoplay was prevented."));
        } else {
            videoRef.current.pause();
        }
    }, []);

    const seek = useCallback((seconds: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime += seconds;
        }
    }, []);

    const toggleMute = useCallback(() => {
        if (!videoRef.current) return;
        const newMuted = !videoRef.current.muted;
        videoRef.current.muted = newMuted;
        setIsMuted(newMuted);
        localStorage.setItem('playerMuted', String(newMuted));
        if (!newMuted && videoRef.current.volume === 0) {
            videoRef.current.volume = 0.5;
            setVolume(0.5);
        }
    }, []);

    const toggleFullscreen = useCallback(() => {
        if (!playerContainerRef.current) return;
        if (!document.fullscreenElement) {
            playerContainerRef.current.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }, []);

    // Keyboard Shortcuts Effect
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

            switch (e.key.toLowerCase()) {
                case ' ':
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'f':
                    toggleFullscreen();
                    break;
                case 'm':
                    toggleMute();
                    break;
                case 'arrowright':
                    seek(10);
                    break;
                case 'arrowleft':
                    seek(-10);
                    break;
                case 'arrowup':
                    e.preventDefault();
                    if (videoRef.current) {
                        const newVolume = Math.min(1, videoRef.current.volume + 0.1);
                        videoRef.current.volume = newVolume;
                        setVolume(newVolume);
                    }
                    break;
                case 'arrowdown':
                    e.preventDefault();
                    if (videoRef.current) {
                        const newVolume = Math.max(0, videoRef.current.volume - 0.1);
                        videoRef.current.volume = newVolume;
                        setVolume(newVolume);
                    }
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [togglePlay, toggleFullscreen, toggleMute, seek]);

    // Video Element Event Handlers
    const onPlay = useCallback(() => setIsPlaying(true), []);
    const onPause = useCallback(() => setIsPlaying(false), []);
    const onLoadedMetadata = useCallback(() => setDuration(videoRef.current?.duration || 0), [videoRef]);
    const onVolumeChange = useCallback(() => {
        if (videoRef.current) {
            setIsMuted(videoRef.current.muted);
            setVolume(videoRef.current.volume);
        }
    }, [videoRef]);
    const onProgress = useCallback(() => {
        if (videoRef.current && videoRef.current.buffered.length > 0) {
            setBuffered(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
        }
    }, [videoRef]);
    const onTimeUpdate = useCallback(() => {
        const time = videoRef.current?.currentTime || 0;
        if (!isScrubbing) {
            setCurrentTime(time);
        }
        const activeSkip = skipIntervals.find(interval => time >= interval.start_time && time < interval.end_time);
        setCurrentSkipInterval(activeSkip || null);
        if (isAutoSkipEnabled && activeSkip && videoRef.current && !videoRef.current.paused) {
            videoRef.current.currentTime = activeSkip.end_time;
            setCurrentSkipInterval(null);
        }
    }, [videoRef, isScrubbing, skipIntervals, isAutoSkipEnabled]);

    // Subtitle Style Effect
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
            bottom: ${Math.abs(subtitlePosition)}% !important;
          }
        `;
    }, [subtitleFontSize, subtitlePosition]);

    const actions = useMemo(() => ({
        togglePlay, seek, toggleMute, toggleFullscreen, onPlay, onPause, onLoadedMetadata,
        onVolumeChange, onProgress, onTimeUpdate, setShowControls, setIsScrubbing, setHoverTime,
        setIsAutoSkipEnabled, setCurrentSkipInterval, setShowCCMenu, setSubtitleFontSize,
        setSubtitlePosition, setAvailableSubtitles, setActiveSubtitleTrack, setShowSourceMenu,
        wasPlayingBeforeScrub, inactivityTimer, setIsFullscreen
    }), [
        togglePlay, seek, toggleMute, toggleFullscreen, onPlay, onPause, onLoadedMetadata,
        onVolumeChange, onProgress, onTimeUpdate, setShowControls, setIsScrubbing, setHoverTime,
        setIsAutoSkipEnabled, setCurrentSkipInterval, setShowCCMenu, setSubtitleFontSize,
        setSubtitlePosition, setAvailableSubtitles, setActiveSubtitleTrack, setShowSourceMenu,
        wasPlayingBeforeScrub, inactivityTimer, setIsFullscreen
    ]);

    return {
        refs: { videoRef, playerContainerRef, progressBarRef },
        state: {
            isPlaying, isMuted, volume, isFullscreen, currentTime, duration, buffered, showControls,
            isScrubbing, hoverTime, isAutoSkipEnabled, currentSkipInterval, showCCMenu, subtitleFontSize,
            subtitlePosition, availableSubtitles, activeSubtitleTrack, showSourceMenu
        },
        actions: actions
    };
};

// --- COMPONENT: PlayerControls ---
interface PlayerControlsProps {
    player: ReturnType<typeof useVideoPlayer>;
    isAutoplayEnabled: boolean;
    onAutoplayChange: (checked: boolean) => void;
    videoSources: VideoSource[];
    selectedSource: VideoSource | null;
    selectedLink: VideoLink | null;
    onSourceChange: (source: VideoSource, link: VideoLink) => void;
    loadingVideo: boolean;
}

const PlayerControls: React.FC<PlayerControlsProps> = ({ player, isAutoplayEnabled, onAutoplayChange, videoSources, selectedSource, selectedLink, onSourceChange, loadingVideo }) => {
    const { refs, state, actions } = player;

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!refs.videoRef.current) return;
        const newVolume = parseFloat(e.target.value);
        refs.videoRef.current.volume = newVolume;
        refs.videoRef.current.muted = newVolume === 0;
        localStorage.setItem('playerVolume', newVolume.toString());
    };

    const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!refs.videoRef.current || !refs.progressBarRef.current || isNaN(state.duration) || state.duration === 0) return;
        const rect = refs.progressBarRef.current.getBoundingClientRect();
        const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        refs.videoRef.current.currentTime = percent * state.duration;
    };

    const handleProgressBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!refs.progressBarRef.current || !state.duration) return;
        const rect = refs.progressBarRef.current.getBoundingClientRect();
        const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        const time = percent * state.duration;
        actions.setHoverTime({ time, position: e.clientX - rect.left });
    };

    const handleThumbMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (!refs.videoRef.current) return;
        actions.setIsScrubbing(true);
        actions.wasPlayingBeforeScrub.current = !refs.videoRef.current.paused;
        refs.videoRef.current.pause();
    };

    const handleSubtitleSelection = (trackId: string | null) => {
        if (!refs.videoRef.current) return;
        actions.setActiveSubtitleTrack(trackId);
        Array.from(refs.videoRef.current.textTracks).forEach(track => {
            track.mode = (trackId !== null && (track.language === trackId || track.label === trackId)) ? 'showing' : 'hidden';
        });
    };

    const renderVolumeIcon = () => {
        if (state.isMuted) return <FaVolumeMute />;
        if (state.volume === 0) return <FaVolumeOff />;
        if (state.volume < 0.5) return <FaVolumeDown />;
        return <FaVolumeUp />;
    };

    useEffect(() => {
        const handleDocumentMouseMove = (e: MouseEvent) => {
            if (!state.isScrubbing || !refs.videoRef.current || !refs.progressBarRef.current || !state.duration) return;
            const rect = refs.progressBarRef.current.getBoundingClientRect();
            const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            const scrubTime = percent * state.duration;
            refs.videoRef.current.currentTime = scrubTime;
            actions.setHoverTime({ time: scrubTime, position: e.clientX - rect.left });
        };
        const handleDocumentMouseUp = () => {
            if (state.isScrubbing) {
                actions.setIsScrubbing(false);
                actions.setHoverTime({ time: 0, position: null });
                if (actions.wasPlayingBeforeScrub.current) {
                    refs.videoRef.current?.play();
                }
            }
        };
        document.addEventListener('mousemove', handleDocumentMouseMove);
        document.addEventListener('mouseup', handleDocumentMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleDocumentMouseMove);
            document.removeEventListener('mouseup', handleDocumentMouseUp);
        };
    }, [state.isScrubbing, state.duration, refs.videoRef, refs.progressBarRef, actions]);

    return (
        <div className={`${styles.controlsOverlay} ${!state.showControls ? styles.hidden : ''}`} onDoubleClick={(e) => e.stopPropagation()}>
            {!state.isPlaying && !loadingVideo && (
                <button className={styles.centerPlayPause} onClick={actions.togglePlay}>
                    <FaPlay />
                </button>
            )}
            <div className={styles.bottomControls}>
                <div
                    className={styles.progressBarContainer}
                    ref={refs.progressBarRef}
                    onClick={handleProgressBarClick}
                    onMouseMove={handleProgressBarMouseMove}
                    onMouseLeave={() => actions.setHoverTime({ time: 0, position: null })}
                >
                    {state.hoverTime.position !== null && (
                        <div className={styles.timeBubble} style={{ left: state.hoverTime.position }}>
                            {formatTime(state.hoverTime.time)}
                        </div>
                    )}
                    <div className={styles.progressBar}>
                        {state.duration > 0 && player.state.currentSkipInterval && (
                            <div
                                className={`${styles.skipSegment} ${styles[player.state.currentSkipInterval.skip_type]}`}
                                style={{
                                    left: `${(player.state.currentSkipInterval.start_time / state.duration) * 100}%`,
                                    width: `${((player.state.currentSkipInterval.end_time - player.state.currentSkipInterval.start_time) / state.duration) * 100}%`,
                                }}
                            ></div>
                        )}
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
                        <button className={styles.controlBtn} onClick={actions.togglePlay}>{state.isPlaying ? <FaPause /> : <FaPlay />}</button>
                        <div className={styles.volumeContainer}>
                            <button className={styles.controlBtn} onClick={actions.toggleMute}>{renderVolumeIcon()}</button>
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
                                if (refs.videoRef.current && state.currentSkipInterval) {
                                    refs.videoRef.current.currentTime = state.currentSkipInterval.end_time;
                                    actions.setCurrentSkipInterval(null);
                                }
                            }}>
                                Skip {state.currentSkipInterval.skip_type === 'op' ? 'Opening' : 'Ending'}
                            </button>
                        )}
                    </div>
                    <div className={styles.rightControls}>
                        <div className={styles.middleControls}>
                            <button className={styles.controlBtn} onClick={() => actions.seek(-10)}>
                                <svg width="36" height="36" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" strokeWidth="3" stroke="currentColor" fill="none"><path strokeLinecap="round" strokeLinejoin="round" d="M34 52h18V16H24"/><path strokeLinecap="round" d="M24 16H8"/><path strokeLinecap="round" strokeLinejoin="round" d="m11.5 12-4 4 4 4"/><text x="3" y="53" fontSize="28" fill="currentColor" stroke="none">10</text></svg>
                            </button>
                            <button className={styles.controlBtn} onClick={() => actions.seek(10)}>
                                <svg width="36" height="36" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" strokeWidth="3" stroke="currentColor" fill="none"><path strokeLinecap="round" strokeLinejoin="round" d="M30 52H12V16h28"/><path strokeLinecap="round" d="M40 16h16"/><path strokeLinecap="round" strokeLinejoin="round" d="m52 12 4.5 4-4.5 4"/><text x="29" y="53.5" fontSize="28" fill="currentColor" stroke="none">10</text></svg>
                            </button>
                        </div>
                        <div className={styles.toggleContainer}>
                            <span>Auto Skip</span>
                            <ToggleSwitch id="auto-skip-toggle" isChecked={state.isAutoSkipEnabled} onChange={(e) => {
                                const checked = e.target.checked;
                                actions.setIsAutoSkipEnabled(checked);
                                localStorage.setItem('autoSkipEnabled', checked.toString());
                            }} />
                        </div>
                        <div className={styles.toggleContainer}>
                            <span>Autoplay</span>
                            <ToggleSwitch id="autoplay-toggle" isChecked={isAutoplayEnabled} onChange={(e) => onAutoplayChange(e.target.checked)} />
                        </div>
                        <div className={styles.ccMenuContainer}>
                            <button className={styles.controlBtn} onClick={() => actions.setShowCCMenu(!state.showCCMenu)}><FaClosedCaptioning /></button>
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
                                            actions.setSubtitleFontSize(value);
                                            localStorage.setItem('subtitleFontSize', value.toString());
                                        }}/>
                                        <span>{state.subtitleFontSize.toFixed(1)}</span>
                                    </div>
                                    <div className={styles.ccSliderContainer}>
                                        <label htmlFor="positionSlider">Position</label>
                                        <input type="range" id="positionSlider" min="-10" max="0" step="1" value={state.subtitlePosition} onChange={(e) => {
                                            const value = parseInt(e.target.value, 10);
                                            actions.setSubtitlePosition(value);
                                            localStorage.setItem('subtitlePosition', value.toString());
                                        }}/>
                                        <span>{state.subtitlePosition}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className={styles.sourceMenuContainer}>
                            <button className={styles.controlBtn} onClick={() => actions.setShowSourceMenu(!state.showSourceMenu)}><FaList /></button>
                            {state.showSourceMenu && (
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
                                                            onSourceChange(source, link);
                                                            actions.setShowSourceMenu(false);
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
                        <button className={styles.controlBtn} onClick={actions.toggleFullscreen}>{state.isFullscreen ? <FaCompress /> : <FaExpand />}</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- COMPONENT: EpisodeList ---
interface EpisodeListProps {
    episodes: string[];
    currentEpisode?: string;
    watchedEpisodes: string[];
    currentMode: 'sub' | 'dub';
    onEpisodeClick: (ep: string) => void;
}

const EpisodeList: React.FC<EpisodeListProps> = ({ episodes, currentEpisode, watchedEpisodes, currentMode, onEpisodeClick }) => {
    return (
        <div className={styles.episodeListContainer}>
            <h3>Episodes ({currentMode.toUpperCase()})</h3>
            <div className={styles.episodeList}>
                {episodes.map(ep => (
                    <button
                        key={ep}
                        data-episode={ep}
                        className={`${styles.episodeItem} ${watchedEpisodes.includes(ep) ? styles.watched : ''} ${ep === currentEpisode ? styles.active : ''}`}
                        onClick={() => onEpisodeClick(ep)}
                    >
                        Ep {ep}
                    </button>
                ))}
            </div>
        </div>
    );
};


// --- MAIN COMPONENT: Player ---
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
            showMeta: { ...meta, description: episodeData.description },
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

    if (state.showCombinedDetails || state.showMeta.genres) {
      return;
    }

    try {
      dispatch({ type: 'SET_LOADING', key: 'loadingDetails', value: true });

      const [detailsResponse, allmangaDetailsResponse] = await Promise.all([
        fetch(`/api/show-details/${showId}`),
        fetch(`/api/allmanga-details/${showId}`),
      ]);

      const details = detailsResponse.ok ? await detailsResponse.json() : {};
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
        type: 'SET_ERROR',
        payload: e instanceof Error ? e.message : 'Failed to load details',
      });
      dispatch({ type: 'SET_LOADING', key: 'loadingDetails', value: false });
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
    if (!state.selectedSource || !state.selectedLink || !refs.videoRef.current) return;

    const videoElement = refs.videoRef.current;
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
  }, [state.selectedSource, state.selectedLink, setPreferredSource, refs.videoRef]);

  useEffect(() => {
    const videoElement = refs.videoRef.current;
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
  }, [showId, state.currentEpisode, state.showMeta, refs.videoRef]);

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
  }, [player.state.isPlaying, isMobile, player.refs.playerContainerRef, player.actions.setShowControls, player.actions.inactivityTimer]);

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
        body: JSON.stringify({ id: showId, name: state.showMeta.name, thumbnail: state.showMeta.thumbnail })
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
        <button className={styles.detailsToggle} onClick={handleToggleDetails}>
          <h3>Details</h3>
          {state.showCombinedDetails ? <FaChevronUp /> : <FaChevronDown />}
        </button>
        {state.showCombinedDetails && (
          <>
            {state.loadingDetails ? (
              <p className={styles.loadingDetails}>Loading details...</p>
            ) : (
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
          </>
        )}
      </div>

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
        
        {!isMobile && <PlayerControls 
            player={player}
            isAutoplayEnabled={state.isAutoplayEnabled}
            onAutoplayChange={handleAutoplayChange}
            videoSources={state.videoSources}
            selectedSource={state.selectedSource}
            selectedLink={state.selectedLink}
            onSourceChange={(source, link) => dispatch({ type: 'SET_STATE', payload: { selectedSource: source, selectedLink: link }})}
            loadingVideo={state.loadingVideo}
        />}

        <video 
            ref={refs.videoRef} 
            controls={isMobile}
            onClick={!isMobile ? actions.togglePlay : undefined}
            onPlay={actions.onPlay}
            onPause={actions.onPause}
            onLoadedMetadata={actions.onLoadedMetadata}
            onTimeUpdate={actions.onTimeUpdate}
            onProgress={actions.onProgress}
            onVolumeChange={actions.onVolumeChange}
        />
      </div>

      {isMobile && (
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