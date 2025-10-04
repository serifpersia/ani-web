import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { SkipInterval } from '../pages/Player';

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
    const [hoverTime, setHoverTime] = useState<{ time: number, position: number | null }>({ time: 0, position: null });
    const [isAutoSkipEnabled, setIsAutoSkipEnabled] = useState(localStorage.getItem('autoSkipEnabled') === 'true');
    const [currentSkipInterval, setCurrentSkipInterval] = useState<SkipInterval | null>(null);
    const [showCCMenu, setShowCCMenu] = useState(false);
    const [subtitleFontSize, setSubtitleFontSize] = useState(parseFloat(localStorage.getItem('subtitleFontSize') || '1.8'));
    const [subtitlePosition, setSubtitlePosition] = useState(parseInt(localStorage.getItem('subtitlePosition') || '-4'));
    const [availableSubtitles, setAvailableSubtitles] = useState<TextTrack[]>([]);
    const [activeSubtitleTrack, setActiveSubtitleTrack] = useState<string | null>(null);
    const [showSourceMenu, setShowSourceMenu] = useState(false);

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

    const onPlay = useCallback(() => setIsPlaying(true), []);
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
    }, [isScrubbing, skipIntervals, isAutoSkipEnabled]);

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
        togglePlay, seek, toggleMute, toggleFullscreen, onPlay, onPause, onLoadedMetadata, formatTime,
        onVolumeChange, onProgress, onTimeUpdate, setShowControls, setIsScrubbing, setHoverTime,
        setIsAutoSkipEnabled, setCurrentSkipInterval, setShowCCMenu, setSubtitleFontSize,
        setSubtitlePosition, setAvailableSubtitles, setActiveSubtitleTrack, setShowSourceMenu,
        wasPlayingBeforeScrub, inactivityTimer, setIsFullscreen
    }), [
        togglePlay, seek, toggleMute, toggleFullscreen, onPlay, onPause, onLoadedMetadata,
        onVolumeChange, onProgress, onTimeUpdate, setIsFullscreen
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

export default useVideoPlayer;