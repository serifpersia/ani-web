import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { SkipInterval } from '../pages/Player';

interface VideoPlayerProps {
    skipIntervals: SkipInterval[];
    showId?: string;
    episodeNumber?: string;
    showMeta?: { name?: string; thumbnail?: string; names?: { native?: string; english?: string } };
}

const useVideoPlayer = ({ skipIntervals, showId, episodeNumber, showMeta }: VideoPlayerProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const playerContainerRef = useRef<HTMLDivElement>(null);
    const progressBarRef = useRef<HTMLDivElement>(null);
    const inactivityTimer = useRef<number | null>(null);
    const wasPlayingBeforeScrub = useRef(false);
    const debouncedUpdateTimer = useRef<NodeJS.Timeout | null>(null);
    const lastThrottledUpdateTime = useRef(0);

    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [showControls, setShowControls] = useState(true);
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [hoverTime, setHoverTime] = useState<{ time: number, position: number | null }>({ time: 0, position: null });
    const [isAutoSkipEnabled, setIsAutoSkipEnabled] = useState(localStorage.getItem('autoSkipEnabled') === 'true');
    const [currentSkipInterval, setCurrentSkipInterval] = useState<SkipInterval | null>(null);
    const [showCCMenu, setShowCCMenu] = useState(false);
    const [subtitleFontSize, setSubtitleFontSize] = useState(parseFloat(localStorage.getItem('subtitleFontSize') || '1.8'));
    const [subtitlePosition, setSubtitlePosition] = useState(parseInt(localStorage.getItem('subtitlePosition') || '-4'));
    const [availableSubtitles, setAvailableSubtitles] = useState<TextTrack[]>([]);
    const [activeSubtitleTrack, setActiveSubtitleTrack] = useState<string | null>(null);
    const [showSourceMenu, setShowSourceMenu] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);
    const hasEnded = useRef(false);

    const sendProgressUpdate = useCallback((isFinalUpdate = false) => {
        if (hasEnded.current) return;

        const video = videoRef.current;
        if (!video || !showId || !episodeNumber || !showMeta?.name || isNaN(video.duration) || video.duration === 0) {
            return;
        }

        const isFinished = video.currentTime >= video.duration * 0.95;
        let timeToReport = video.currentTime;

        if (isFinalUpdate && isFinished) {
            timeToReport = video.duration;
        }

        if (timeToReport === 0 && !isFinished) return;

        fetch('/api/update-progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                showId,
                episodeNumber,
                currentTime: timeToReport,
                duration: video.duration,
                showName: showMeta.name,
                showThumbnail: showMeta.thumbnail,
                nativeName: showMeta.names?.native,
                englishName: showMeta.names?.english,
            })
        }).catch(err => console.error("Failed to update progress:", err));
    }, [showId, episodeNumber, showMeta]);

    useEffect(() => {
        const handleBeforeUnload = () => {
            if (!hasEnded.current) {
                sendProgressUpdate(true);
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            if (!hasEnded.current) {
                sendProgressUpdate(true);
            }
        };
    }, [sendProgressUpdate]);

    const formatTime = (timeInSeconds: number): string => {
        if (isNaN(timeInSeconds) || timeInSeconds <= 0) return '00:00';
        const result = new Date(timeInSeconds * 1000).toISOString().slice(11, 19);
        const hours = parseInt(result.slice(0, 2), 10);
        return hours > 0 ? result : result.slice(3);
    };

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
            if (debouncedUpdateTimer.current) clearTimeout(debouncedUpdateTimer.current);
            debouncedUpdateTimer.current = setTimeout(() => {
                sendProgressUpdate();
            }, 1500);
        }
    }, [sendProgressUpdate]);

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

    const onPlay = useCallback(() => {
        setIsPlaying(true);
        setIsBuffering(false);
    }, []);
    const onPlaying = useCallback(() => {
        setIsBuffering(false);
    }, []);
    const onWaiting = useCallback(() => {
        setIsBuffering(true);
    }, []);
    const onPause = useCallback(() => setIsPlaying(false), []);
    const onLoadedMetadata = useCallback(() => setDuration(videoRef.current?.duration || 0), []);
    const onVolumeChange = useCallback(() => {
        if (videoRef.current) {
            setIsMuted(videoRef.current.muted);
            setVolume(videoRef.current.volume);
        }
    }, []);
    const onProgress = useCallback(() => {
        if (videoRef.current && videoRef.current.buffered.length > 0) {
            setBuffered(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
        }
    }, []);
    const onTimeUpdate = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        const time = video.currentTime || 0;
        if (!isScrubbing) {
            setCurrentTime(time);
        }
        
        const now = Date.now();
        if (now - lastThrottledUpdateTime.current > 5000) {
            lastThrottledUpdateTime.current = now;
            sendProgressUpdate();
        }

        const activeSkip = skipIntervals.find(interval => time >= interval.start_time && time < interval.end_time);
        setCurrentSkipInterval(activeSkip || null);
        if (isAutoSkipEnabled && activeSkip && !video.paused) {
            video.currentTime = activeSkip.end_time;
            setCurrentSkipInterval(null);
        }
    }, [isScrubbing, skipIntervals, isAutoSkipEnabled, sendProgressUpdate]);

    const reportFinalProgress = useCallback(() => {
        const video = videoRef.current;
        if (!video || !showId || !episodeNumber || !showMeta?.name || isNaN(video.duration) || video.duration === 0) {
            return;
        }

        fetch('/api/update-progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                showId,
                episodeNumber,
                currentTime: video.duration,
                duration: video.duration,
                showName: showMeta.name,
                showThumbnail: showMeta.thumbnail,
                nativeName: showMeta.names?.native,
                englishName: showMeta.names?.english,
            })
        }).catch(err => console.error("Failed to send final progress:", err));
    }, [showId, episodeNumber, showMeta]);

    const onEnded = useCallback(() => {
        hasEnded.current = true;
        reportFinalProgress();
    }, [reportFinalProgress]);

    useEffect(() => {
        const handleDocumentMouseUp = () => {
            if (isScrubbing) {
                setIsScrubbing(false);
                setHoverTime({ time: 0, position: null });
                if (wasPlayingBeforeScrub.current) {
                    videoRef.current?.play();
                }
                sendProgressUpdate();
            }
        };
        if (isScrubbing) {
            document.addEventListener('mouseup', handleDocumentMouseUp);
        }
        return () => {
            document.removeEventListener('mouseup', handleDocumentMouseUp);
        };
    }, [isScrubbing, sendProgressUpdate]);

    const actions = useMemo(() => ({
        togglePlay, seek, toggleMute, toggleFullscreen, onPlay, onPause, onLoadedMetadata, formatTime,
        onVolumeChange, onProgress, onTimeUpdate, onEnded, setShowControls, setIsScrubbing, setHoverTime,
        setIsAutoSkipEnabled, setCurrentSkipInterval, setShowCCMenu, setSubtitleFontSize,
        setSubtitlePosition, setAvailableSubtitles, setActiveSubtitleTrack, setShowSourceMenu,
        wasPlayingBeforeScrub, inactivityTimer, setIsFullscreen, onWaiting, onPlaying, setCurrentTime
    }), [
        togglePlay, seek, toggleMute, toggleFullscreen, onPlay, onPause, onLoadedMetadata,
        onVolumeChange, onProgress, onTimeUpdate, onEnded, setIsFullscreen, onWaiting, onPlaying, setCurrentTime
    ]);

    return {
        refs: { videoRef, playerContainerRef, progressBarRef },
        state: {
            isPlaying, isMuted, volume, isFullscreen, currentTime, duration, buffered, showControls,
            isScrubbing, hoverTime, isAutoSkipEnabled, currentSkipInterval, showCCMenu, subtitleFontSize,
            subtitlePosition, availableSubtitles, activeSubtitleTrack, showSourceMenu, isBuffering
        },
        actions: actions
    };
};

export default useVideoPlayer;