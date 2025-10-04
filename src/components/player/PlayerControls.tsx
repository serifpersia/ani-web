import React, { useEffect } from 'react';
import styles from '../../pages/Player.module.css';
import ToggleSwitch from '../common/ToggleSwitch';
import { FaPlay, FaPause, FaVolumeUp, FaVolumeMute, FaVolumeDown, FaVolumeOff, FaExpand, FaCompress, FaClosedCaptioning, FaList } from 'react-icons/fa';
import type { VideoSource, VideoLink } from '../../pages/Player';
import type useVideoPlayer from '../../hooks/useVideoPlayer';

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

const PlayerControls: React.FC<PlayerControlsProps> = ({ player, isAutoplayEnabled, onAutoplayChange, selectedSource, selectedLink, onSourceChange, loadingVideo }) => {
    const { refs, state, actions } = player;

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
                            {actions.formatTime(state.hoverTime.time)}
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
                        <span className={styles.timeDisplay}>{actions.formatTime(state.currentTime)} / {actions.formatTime(state.duration)}</span>
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
                                            e.target.style.setProperty('--slider-percent', `${((value - 1) / 2) * 100}%`);
                                        }}/>
                                        <span>{state.subtitleFontSize.toFixed(1)}</span>
                                    </div>
                                    <div className={styles.ccSliderContainer}>
                                        <label htmlFor="positionSlider">Position</label>
                                        <input type="range" id="positionSlider" min="-10" max="0" step="1" value={state.subtitlePosition} onChange={(e) => {
                                            const value = parseInt(e.target.value, 10);
                                            actions.setSubtitlePosition(value);
                                            localStorage.setItem('subtitlePosition', value.toString());
                                            e.target.style.setProperty('--slider-percent', `${((value + 10) / 10) * 100}%`);
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
                                    <h4>Quality</h4>
                                    {selectedSource && selectedSource.links.length > 1 && (
                                        <div className={styles.qualityListInMenu}>
                                            {selectedSource.links.sort((a, b) => (parseInt(b.resolutionStr) || 0) - (parseInt(a.resolutionStr) || 0)).map(link => (
                                                <button
                                                    key={link.resolutionStr}
                                                    className={`${styles.qualityItemInMenu} ${selectedLink?.resolutionStr === link.resolutionStr ? styles.active : ''}`}
                                                    onClick={() => {
                                                        onSourceChange(selectedSource, link);
                                                        actions.setShowSourceMenu(false);
                                                    }}
                                                >
                                                    {link.resolutionStr}
                                                </button>
                                            ))}
                                        </div>
                                    )}
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

export default PlayerControls;