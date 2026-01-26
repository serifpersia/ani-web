import React, { useEffect, useState } from 'react';
import styles from '../../pages/Player.module.css';
import ToggleSwitch from '../common/ToggleSwitch';
import { FaPlay, FaPause, FaVolumeUp, FaVolumeMute, FaVolumeDown, FaVolumeOff, FaExpand, FaCompress, FaCog } from 'react-icons/fa';
import type { VideoSource, VideoLink, SkipInterval } from '../../types/player';
import type useVideoPlayer from '../../hooks/useVideoPlayer';
import PlayerSettings from './PlayerSettings';

interface PlayerControlsProps {
    player: ReturnType<typeof useVideoPlayer>;
    isAutoplayEnabled: boolean;
    onAutoplayChange: (checked: boolean) => void;
    videoSources: VideoSource[];
    selectedSource: VideoSource | null;
    selectedLink: VideoLink | null;
    onSourceChange: (source: VideoSource, link: VideoLink) => void;
    loadingVideo: boolean;
    skipIntervals: SkipInterval[];
}

const PlayerControls: React.FC<PlayerControlsProps> = ({
    player,
    isAutoplayEnabled,
    onAutoplayChange,
    videoSources,
    selectedSource,
    selectedLink,
    onSourceChange,
    loadingVideo,
    skipIntervals
}) => {
    const { state, refs, actions } = player;
    const [showSettings, setShowSettings] = useState(false);

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!refs.videoRef.current) return;
        const newVolume = parseFloat(e.target.value);
        refs.videoRef.current.volume = newVolume;
        refs.videoRef.current.muted = newVolume === 0;
        localStorage.setItem('playerVolume', newVolume.toString());
        e.target.style.setProperty('--volume-percent', `${newVolume * 100}%`);
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
            actions.setCurrentTime(scrubTime);
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

        <div className={`${styles.controlsOverlay} ${!state.showControls && !showSettings ? styles.hidden : ''}`} onDoubleClick={(e) => e.stopPropagation()}>



            <div
                className={styles.bottomControls}
            >
                { }
                <div
                    className={`${styles.progressBarContainer} ${state.isScrubbing ? styles.scrubbing : ''}`}
                    ref={refs.progressBarRef}
                    onClick={handleProgressBarClick}
                    onMouseMove={handleProgressBarMouseMove}
                    onMouseLeave={() => actions.setHoverTime({ time: 0, position: null })}
                >
                    {state.hoverTime.position !== null && (
                        <div className={styles.timeBubble} style={{ left: state.hoverTime.position }}>
                            {actions.formatTime(state.hoverTime.time)}
                        </div>
                    )}
                    <div className={styles.progressBar}>
                        { }
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

                        { }
                        {skipIntervals.map(interval => {
                            const startPercent = (interval.start_time / state.duration) * 100;
                            const widthPercent = ((interval.end_time - interval.start_time) / state.duration) * 100;
                            return (
                                <div
                                    key={interval.skip_id}
                                    className={`${styles.skipSegment} ${styles[interval.skip_type]}`}
                                    style={{ left: `${startPercent}%`, width: `${widthPercent}%` }}
                                    title={interval.skip_type.toUpperCase()}
                                />
                            );
                        })}
                    </div>
                </div>

                { }
                <div className={styles.bottomControlsRow}>
                    <div className={styles.leftControls}>
                        <button className={styles.controlBtn} onClick={actions.togglePlay}>
                            {state.isPlaying ? <FaPause /> : <FaPlay />}
                        </button>

                        <div className={styles.volumeContainer}>
                            <button className={styles.controlBtn} onClick={actions.toggleMute}>
                                {renderVolumeIcon()}
                            </button>
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

                        <span className={styles.timeDisplay}>
                            {actions.formatTime(state.currentTime)} / {actions.formatTime(state.duration)}
                        </span>

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
                        <div className={styles.toggleContainer}>
                            <span>Auto Skip</span>
                            <ToggleSwitch
                                id="auto-skip-toggle"
                                isChecked={state.isAutoSkipEnabled}
                                onChange={(e) => {
                                    const checked = e.target.checked;
                                    actions.setIsAutoSkipEnabled(checked);
                                    localStorage.setItem('autoSkipEnabled', checked.toString());
                                }}
                            />
                        </div>

                        <div className={styles.toggleContainer}>
                            <span>Autoplay</span>
                            <ToggleSwitch
                                id="autoplay-toggle"
                                isChecked={isAutoplayEnabled}
                                onChange={(e) => onAutoplayChange(e.target.checked)}
                            />
                        </div>

                        <button className={`${styles.controlBtn} ${showSettings ? styles.active : ''}`} onClick={() => setShowSettings(!showSettings)}>
                            <FaCog />
                        </button>

                        <button className={styles.controlBtn} onClick={actions.toggleFullscreen}>
                            {state.isFullscreen ? <FaCompress /> : <FaExpand />}
                        </button>
                    </div>
                </div>
            </div>

            <PlayerSettings
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                videoSources={videoSources}
                currentSource={selectedSource}
                currentLink={selectedLink}
                onSourceChange={onSourceChange}
                subtitles={state.availableSubtitles}
                activeSubtitleTrack={state.activeSubtitleTrack}
                onSubtitleChange={handleSubtitleSelection}
                subtitleSettings={{
                    fontSize: state.subtitleFontSize,
                    position: state.subtitlePosition
                }}
                onSubtitleSettingsChange={(key, value) => {
                    if (key === 'fontSize') {
                        actions.setSubtitleFontSize(value);
                        localStorage.setItem('subtitleFontSize', value.toString());
                    } else {
                        actions.setSubtitlePosition(value);
                        localStorage.setItem('subtitlePosition', value.toString());
                    }
                }}
            />
        </div>
    );
};

export default PlayerControls;