import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styles from './Player.module.css';
import layoutStyles from './PlayerPageLayout.module.css';
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
import useVideoPlayer from '../hooks/useVideoPlayer';
import { usePlayerData } from '../hooks/usePlayerData';
import type { VideoLink, SubtitleTrack } from '../types/player';

const Player: React.FC = () => {
  const { id: showId, episodeNumber } = useParams<{ id: string; episodeNumber?: string }>();
  const navigate = useNavigate();

  const { state, dispatch, toggleWatchlist, handleToggleDetails } = usePlayerData(showId, episodeNumber);

  const memoizedShowMeta = useMemo(() => {
    if (!state.showMeta.name) return undefined;
    return {
      name: state.showMeta.name,
      thumbnail: state.showMeta.thumbnail,
      names: state.showMeta.names,
      genres: state.showMeta.genres,
      score: state.showMeta.score
    };
  }, [state.showMeta.name, state.showMeta.thumbnail, state.showMeta.names, state.showMeta.genres, state.showMeta.score]);

  const player = useVideoPlayer({
    skipIntervals: state.skipIntervals,
    showId,
    episodeNumber: state.currentEpisode?.toString(),
    showMeta: memoizedShowMeta
  });
  const { refs, actions } = player;

  const hlsInstance = useRef<Hls | null>(null);
  const isMobile = useIsMobile();
  const wasFullscreenRef = useRef(false);


  useEffect(() => {
    const videoElement = refs.videoRef.current;
    if (!videoElement) return;

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
        if (sub.src) {
          track.src = `/api/subtitle-proxy?url=${encodeURIComponent(sub.src)}`;
        }
        if (sub.lang === 'en' || sub.label === 'English') {
          track.default = true;
        }
        videoElement.appendChild(track);
      });
      actions.setAvailableSubtitles(state.selectedSource.subtitles);
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

    const savedVolume = localStorage.getItem('playerVolume');
    const savedMuted = localStorage.getItem('playerMuted');

    if (savedVolume !== null) {
      videoElement.volume = parseFloat(savedVolume);
    }
    if (savedMuted !== null) {
      videoElement.muted = savedMuted === 'true';
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
  }, [state.selectedSource, state.selectedLink, refs.videoRef, actions]);

  useEffect(() => {
    const videoElement = refs.videoRef.current;
    if (!videoElement) return;
    const handleVideoEnd = () => {
      actions.onEnded();
      if (state.isAutoplayEnabled) {
        const currentIndex = state.episodes.findIndex(ep => ep === state.currentEpisode);
        if (currentIndex > -1 && currentIndex < state.episodes.length - 1) {
          const nextEpisode = state.episodes[currentIndex + 1];
          wasFullscreenRef.current = player.state.isFullscreen;
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
  }, [state.isAutoplayEnabled, state.episodes, state.currentEpisode, showId, navigate, refs.videoRef, actions, player.state.isFullscreen]);

  useEffect(() => {
    if (!state.loadingVideo && wasFullscreenRef.current) {
      player.actions.toggleFullscreen();
      wasFullscreenRef.current = false;
    }
  }, [state.loadingVideo, player.actions]);

  useEffect(() => {
    if (state.showResumeModal && refs.videoRef.current) {
      refs.videoRef.current.pause();
    }
  }, [state.showResumeModal, refs.videoRef]);

  const { titlePreference } = useTitlePreference();
  const displayTitle = useMemo(() => {
    if (!state.showMeta) return 'Loading...';
    const { name, names } = state.showMeta;
    if (titlePreference === 'name' && name) return name;
    if (titlePreference === 'nativeName' && names?.native) return names.native;
    if (titlePreference === 'englishName' && names?.english) return names.english;
    return name || 'Loading...';
  }, [state.showMeta, titlePreference]);

  useEffect(() => {
    if (displayTitle && displayTitle !== 'Loading...' && state.currentEpisode) {
      document.title = `► ${displayTitle} #${state.currentEpisode} - ani-web`;
    }
  }, [displayTitle, state.currentEpisode]);


  const handleMouseMove = useCallback(() => {
    actions.setShowControls(true);
    if (player.actions.inactivityTimer.current) {
      clearTimeout(player.actions.inactivityTimer.current);
    }

    if (player.state.isPlaying) {
      player.actions.inactivityTimer.current = window.setTimeout(() => {
        actions.setShowControls(false);
      }, 1500);
    }
  }, [player.state.isPlaying, actions, player.actions.inactivityTimer]);

  useEffect(() => {
    const container = refs.playerContainerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleMouseMove);
      return () => container.removeEventListener('mousemove', handleMouseMove);
    }
  }, [handleMouseMove, refs.playerContainerRef]);

  const { setIsFullscreen, setAvailableSubtitles, setActiveSubtitleTrack } = actions;



  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [setIsFullscreen]);

  useEffect(() => {
    const videoElement = refs.videoRef.current;
    if (!videoElement) return;
    const handleTracksChange = () => {
      const tracks: SubtitleTrack[] = Array.from(videoElement.textTracks).map(t => ({
        label: t.label,
        lang: t.language,
        src: undefined,
        mode: t.mode as 'showing' | 'hidden' | 'disabled'
      }));
      setAvailableSubtitles(tracks);
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

  useEffect(() => {
    if (player.state.activeSubtitleTrack === null && player.state.availableSubtitles.length > 0) {
      const englishTrack = player.state.availableSubtitles.find(t => t.lang === 'en' || t.label === 'English');
      const trackToActivate = englishTrack || player.state.availableSubtitles[0];
      setActiveSubtitleTrack(trackToActivate.lang || trackToActivate.label);
      player.state.availableSubtitles.forEach(t => t.mode = (t === trackToActivate) ? 'showing' : 'hidden');
    }
  }, [player.state.activeSubtitleTrack, player.state.availableSubtitles, setActiveSubtitleTrack]);


  useEffect(() => {
    const styleId = 'dynamic-subtitle-styles';
    let styleTag = document.getElementById(styleId);
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = styleId;
      document.head.appendChild(styleTag);
    }

    const fontSize = `${player.state.subtitleFontSize}rem`;

    styleTag.textContent = `
          video::cue {
              font-size: ${fontSize} !important;
              background-color: rgba(0, 0, 0, 0.5) !important;
              color: white !important;
              text-shadow: 0 0 4px black;
          }
      `;

    const video = refs.videoRef.current;
    if (!video) return;

    const updateCuePosition = () => {
      const activeTrack = Array.from(video.textTracks).find(t => t.mode === 'showing');
      if (activeTrack && activeTrack.cues) {
        Array.from(activeTrack.cues).forEach((cue: any) => {
          try {
            cue.snapToLines = false;
            const pos = Math.max(0, Math.min(100, 100 - player.state.subtitlePosition));
            cue.line = pos;
          } catch (e) {
          }
        });
      }
    };

    updateCuePosition();

    const handleCueChange = () => {
      updateCuePosition();
    };


    const activeTrack = Array.from(video.textTracks).find(t => t.mode === 'showing');
    if (activeTrack) {
      activeTrack.addEventListener('cuechange', handleCueChange);
      return () => activeTrack.removeEventListener('cuechange', handleCueChange);
    }

  }, [player.state.subtitleFontSize, player.state.subtitlePosition, player.state.activeSubtitleTrack, refs.videoRef]);

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
  if (state.episodes.length === 0 || !state.currentEpisode) return <p className="error-message">No episodes found.</p>;

  return (
    <div className={layoutStyles.playerPageLayout}>
      <ResumeModal
        show={state.showResumeModal}
        resumeTime={player.actions.formatTime(state.resumeTime)}
        onResume={handleResume}
        onStartOver={handleStartOver}
      />
      <aside className={layoutStyles.episodeSidebar}>
        <EpisodeList
          episodes={state.episodes}
          currentEpisode={state.currentEpisode}
          watchedEpisodes={state.watchedEpisodes}
          onEpisodeClick={(ep) => navigate(`/player/${showId}/${ep}`)}
        />
      </aside>

      <div className={layoutStyles.playerMain}>
        <div ref={refs.playerContainerRef} className={`${styles.videoContainer} ${layoutStyles.videoPlayerWrapper}`} onDoubleClick={actions.toggleFullscreen}>
          {state.loadingVideo && (
            <div className={styles.loadingOverlay}>
              <div className={styles.loadingDots}>
                <div className={styles.dot}></div>
                <div className={styles.dot}></div>
                <div className={styles.dot}></div>
              </div>
            </div>
          )}

          {player.state.isBuffering && !state.loadingVideo && (
            <div className={styles.bufferingOverlay}>
              <div className={styles.bufferingSpinner}></div>
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
                onSourceChange={(source, link) => dispatch({ type: 'SET_STATE', payload: { selectedSource: source, selectedLink: link } })}
                loadingVideo={state.loadingVideo}
                skipIntervals={state.skipIntervals}
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
                onWaiting={actions.onWaiting}
                onPlaying={actions.onPlaying}
              />}
            </>
          )}
        </div>

        {state.loadingVideo ? (
          <div className={styles.sourceLoader}>
            <div className={styles.spinner}></div>
          </div>
        ) : (
          <SourceSelector
            videoSources={state.videoSources}
            selectedSource={state.selectedSource}
            onSourceChange={(source) => {
              const bestLink = source.links.sort((a: VideoLink, b: VideoLink) => (parseInt(b.resolutionStr) || 0) - (parseInt(a.resolutionStr) || 0))[0];
              dispatch({ type: 'SET_STATE', payload: { selectedSource: source, selectedLink: bestLink } })
            }}
          />
        )}

        <div className={layoutStyles.playerInfoContainer}>
          <div className={layoutStyles.playerInfoHeader}>
            <div className={layoutStyles.playerAnimeCard}>
              <img src={fixThumbnailUrl(state.showMeta.thumbnail!)} alt={displayTitle} />
            </div>
            <div className={layoutStyles.videoTitleSection}>
              <div className={styles.titleContainer}>
                <h1>{displayTitle}</h1>
                <div className={styles.scheduleInfo}>
                  {state.showMeta.status && <span className={styles.status}>{state.showMeta.status}</span>}
                  {state.showMeta.nextEpisodeAirDate && (
                    <span className={styles.nextEpisode}>
                      Next episode: {state.showMeta.nextEpisodeAirDate}
                    </span>
                  )}
                </div>
              </div>
              <div className={styles.controls}>
                <button className={`${styles.watchlistBtn} ${state.inWatchlist ? styles.inList : ''}`} onClick={toggleWatchlist}>
                  {state.inWatchlist ? <FaCheck /> : <FaPlus />}
                  {state.inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
                </button>
                <div className={styles.toggleContainer}>
                  <span>SUB</span>
                  <ToggleSwitch
                    id="mode-switch"
                    isChecked={state.currentMode === 'dub'}
                    onChange={(e) => dispatch({ type: 'SET_STATE', payload: { currentMode: e.target.checked ? 'dub' : 'sub' } })}
                  />
                  <span>DUB</span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.descriptionSection}>
            <h3>Synopsis</h3>
            <p className={styles.description}>
              {state.showMeta.description
                ? state.showMeta.description.replace(/<[^>]*>?/gm, '')
                : 'No description available.'}
            </p>
          </div>

          <button className={styles.detailsToggleBtn} onClick={handleToggleDetails}>
            {state.showCombinedDetails ? <FaChevronUp /> : <FaChevronDown />}
            {state.showCombinedDetails ? 'Hide Details' : 'Show Details'}
          </button>

          {state.showCombinedDetails && (
            <>
              <div className={styles.detailsGridContainer}>
                {state.showMeta.mediaTypes?.[0] && (
                  <div className={styles.detailItem}>
                    <strong>Type</strong>
                    <span>{state.showMeta.mediaTypes[0].name}</span>
                  </div>
                )}
                {state.showMeta.status && (
                  <div className={styles.detailItem}>
                    <strong>Status</strong>
                    <span className={styles.animeStatus}>{state.showMeta.status}</span>
                  </div>
                )}
                {state.showMeta.stats?.averageScore && (
                  <div className={styles.detailItem}>
                    <strong>Score</strong>
                    <span>{state.showMeta.stats.averageScore}</span>
                  </div>
                )}
                {state.showMeta.studios && state.showMeta.studios.length > 0 && (
                  <div className={styles.detailItem}>
                    <strong>Studios</strong>
                    <span>{state.showMeta.studios.map(s => s.name).join(', ')}</span>
                  </div>
                )}
                {state.showMeta.sources?.[0] && (
                  <div className={styles.detailItem}>
                    <strong>Source</strong>
                    <span>{state.showMeta.sources[0].name}</span>
                  </div>
                )}
                {state.showMeta.lengthMin && (
                  <div className={styles.detailItem}>
                    <strong>Episode Length</strong>
                    <span>{state.showMeta.lengthMin} min</span>
                  </div>
                )}
                {state.showMeta.names?.english && (
                  <div className={styles.detailItem}>
                    <strong>English Title</strong>
                    <span>{state.showMeta.names.english}</span>
                  </div>
                )}
                {state.showMeta.names?.native && (
                  <div className={styles.detailItem}>
                    <strong>Native Title</strong>
                    <span>{state.showMeta.names.native}</span>
                  </div>
                )}
                {state.showMeta.genres && (
                  <div className={styles.detailItem}>
                    <strong>Genres</strong>
                    <div className={styles.genresList}>
                      {state.showMeta.genres.map(g => (
                        <span key={g.name} className={styles.genreTag}>{g.name}</span>
                      ))}
                    </div>
                  </div>
                )}
                {state.allMangaDetails?.Rating && (
                  <div className={styles.detailItem}>
                    <strong>Rating</strong>
                    <span>{state.allMangaDetails.Rating}</span>
                  </div>
                )}
                {state.allMangaDetails?.Season && (
                  <div className={styles.detailItem}>
                    <strong>Season</strong>
                    <span>{state.allMangaDetails.Season}</span>
                  </div>
                )}
                {state.allMangaDetails?.Episodes && (
                  <div className={styles.detailItem}>
                    <strong>Episodes</strong>
                    <span>{state.allMangaDetails.Episodes}</span>
                  </div>
                )}
                {state.allMangaDetails?.Date && (
                  <div className={styles.detailItem}>
                    <strong>Date</strong>
                    <span>{state.allMangaDetails.Date}</span>
                  </div>
                )}
                {state.allMangaDetails?.['Original Broadcast'] && (
                  <div className={styles.detailItem}>
                    <strong>Original Broadcast</strong>
                    <span>{state.allMangaDetails['Original Broadcast']}</span>
                  </div>
                )}
              </div>

              {state.showMeta.websites && (
                <div className={styles.externalLinksSection}>
                  <strong>External Links</strong>
                  <div className={styles.externalLinksGrid}>
                    {state.showMeta.websites.official && <a href={state.showMeta.websites.official} target="_blank" rel="noopener noreferrer" className={styles.websiteLink}>Official</a>}
                    {state.showMeta.websites.mal && <a href={state.showMeta.websites.mal} target="_blank" rel="noopener noreferrer" className={styles.websiteLink}>MAL</a>}
                    {state.showMeta.websites.aniList && <a href={state.showMeta.websites.aniList} target="_blank" rel="noopener noreferrer" className={styles.websiteLink}>AniList</a>}
                    {state.showMeta.websites.kitsu && <a href={state.showMeta.websites.kitsu} target="_blank" rel="noopener noreferrer" className={styles.websiteLink}>Kitsu</a>}
                    {state.showMeta.websites.animePlanet && <a href={state.showMeta.websites.animePlanet} target="_blank" rel="noopener noreferrer" className={styles.websiteLink}>Anime-Planet</a>}
                    {state.showMeta.websites.anidb && <a href={state.showMeta.websites.anidb} target="_blank" rel="noopener noreferrer" className={styles.websiteLink}>AniDB</a>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>

  );
};

export default Player;