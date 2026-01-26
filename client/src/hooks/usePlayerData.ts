import { useState, useEffect, useCallback, useReducer } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { DetailedShowMeta, VideoSource, VideoLink, SkipInterval, PlayerState } from '../types/player';
import { playerReducer, initialState } from '../reducers/playerReducer';


interface UsePlayerDataReturn {
    state: PlayerState;
    dispatch: React.Dispatch<any>;
    toggleWatchlist: () => Promise<void>;
    setPreferredSource: (sourceName: string) => Promise<void>;
    handleToggleDetails: () => Promise<void>;
}

export const usePlayerData = (showId: string | undefined, episodeNumber: string | undefined): UsePlayerDataReturn => {
    const navigate = useNavigate();
    const [state, dispatch] = useReducer(playerReducer, initialState);

    useEffect(() => {
        const fetchInitialData = async () => {
            if (!showId) return;
            dispatch({ type: 'SET_LOADING', key: 'loadingShowData', value: true });

            try {
                const [metaResponse, episodesResponse, watchlistResponse, watchedResponse] = await Promise.all([
                    fetch(`/api/show-meta/${showId}`),
                    fetch(`/api/episodes?showId=${showId}&mode=${state.currentMode}`),
                    fetch(`/api/watchlist/check/${showId}`, { headers: { 'Content-Type': 'application/json' } }),
                    fetch(`/api/watched-episodes/${showId}`, { headers: { 'Content-Type': 'application/json' } }),
                ]);

                if (!metaResponse.ok) throw new Error("Failed to fetch show metadata");

                const meta = await metaResponse.json();
                const watchlistStatus = watchlistResponse.ok ? await watchlistResponse.json() : { inWatchlist: false };
                const watchedData = watchedResponse.ok ? await watchedResponse.json() : [];

                if (!meta) {
                    dispatch({
                        type: 'SHOW_DATA_SUCCESS',
                        payload: {
                            showMeta: {},
                            episodes: [],
                            inWatchlist: watchlistStatus.inWatchlist,
                            watchedEpisodes: watchedData,
                            currentEpisode: undefined,
                        },
                    });
                    return;
                }

                let episodes = [];
                let description = meta.description;

                if (episodesResponse.ok) {
                    const episodeData = await episodesResponse.json();
                    if (episodeData) {
                        episodes = episodeData.episodes.sort((a: string, b: string) => parseFloat(a) - parseFloat(b));
                        description = episodeData.description || description;
                    }
                }

                dispatch({
                    type: 'SHOW_DATA_SUCCESS',
                    payload: {
                        showMeta: {
                            ...meta,
                            description,
                            names: meta.names || { romaji: meta.name, english: meta.englishName, native: meta.nativeName }
                        },
                        episodes,
                        inWatchlist: watchlistStatus.inWatchlist,
                        watchedEpisodes: watchedData,
                        currentEpisode: episodeNumber || (episodes.length > 0 ? episodes[0] : undefined),
                    },
                });

            } catch (e) {
                console.error("Error fetching show data:", e);
                dispatch({ type: 'SET_ERROR', payload: e instanceof Error ? e.message : 'An unknown error occurred' });
            }
        };

        fetchInitialData();
    }, [showId, state.currentMode, episodeNumber]);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!showId || state.loadingShowData) return;
            if (state.showMeta.genres) return;

            dispatch({ type: 'SET_LOADING', key: 'loadingDetails', value: true });

            try {
                const detailsResponse = await fetch(`/api/show-details/${showId}`);
                if (detailsResponse.ok) {
                    const details = await detailsResponse.json();
                    dispatch({ type: 'SET_STATE', payload: { showMeta: { ...state.showMeta, ...details }, loadingDetails: false } });
                }
            } catch (error) {
                console.warn("Failed to background fetch details:", error);
                dispatch({ type: 'SET_LOADING', key: 'loadingDetails', value: false });
            }
        };

        fetchDetails();
    }, [showId, state.loadingShowData, state.showMeta.genres]);


    useEffect(() => {
        if (!showId || !state.currentEpisode) return;

        const fetchVideoSources = async () => {
            dispatch({ type: 'SET_LOADING', key: 'loadingVideo', value: true });
            dispatch({ type: 'SET_STATE', payload: { videoSources: [], selectedSource: null, selectedLink: null, skipIntervals: [] } });

            try {
                const [sourcesResponse, progressResponse, preferredSourceResponse, skipTimesResponse] = await Promise.all([
                    fetch(`/api/video?showId=${showId}&episodeNumber=${state.currentEpisode}&mode=${state.currentMode}`),
                    fetch(`/api/episode-progress/${showId}/${state.currentEpisode}`, { headers: { 'Content-Type': 'application/json' } }),
                    fetch(`/api/settings?key=preferredSource`, { headers: { 'Content-Type': 'application/json' } }),
                    fetch(`/api/skip-times/${showId}/${state.currentEpisode}`)
                ]);

                if (!sourcesResponse.ok) throw new Error("Failed to fetch video sources");
                const sources: VideoSource[] = await sourcesResponse.json();

                const preferredSourceName = preferredSourceResponse.ok ? (await preferredSourceResponse.json()).value : null;

                let sourceToSelect: VideoSource | null = sources.length > 0 ? sources[0] : null;
                if (preferredSourceName) {
                    const found = sources.find(s => s.sourceName === preferredSourceName);
                    if (found) sourceToSelect = found;
                }

                const selectedLink = sourceToSelect && sourceToSelect.links.length > 0
                    ? sourceToSelect.links.sort((a: VideoLink, b: VideoLink) => (parseInt(b.resolutionStr) || 0) - (parseInt(a.resolutionStr) || 0))[0]
                    : null;

                let resumeTime = 0;
                let showResumeModal = false;

                if (progressResponse.ok) {
                    try {
                        const progress = await progressResponse.json();
                        if (progress?.currentTime > 0 && progress.currentTime < (progress.duration || 10000) * 0.95) {
                            resumeTime = progress.currentTime;
                            showResumeModal = true;
                        }
                    } catch (e) {
                        console.warn("Failed to parse progress:", e);
                    }
                }

                const skipResponseData = skipTimesResponse.ok ? await skipTimesResponse.json() : [];
                const rawSkips = Array.isArray(skipResponseData) ? skipResponseData : (skipResponseData.results || []);

                const skipIntervals: SkipInterval[] = Array.isArray(rawSkips) ? rawSkips.map((item: any) => ({
                    skip_id: item.skip_id,
                    skip_type: item.skip_type,
                    start_time: item.interval?.start_time ?? item.start_time ?? 0,
                    end_time: item.interval?.end_time ?? item.end_time ?? 0
                })).filter(i => i.end_time > 0) : [];

                dispatch({
                    type: 'SET_STATE', payload: {
                        videoSources: sources,
                        selectedSource: sourceToSelect,
                        selectedLink,
                        resumeTime,
                        showResumeModal: showResumeModal && resumeTime > 5,
                        skipIntervals,
                        loadingVideo: false
                    }
                });

            } catch (e) {
                dispatch({ type: 'SET_ERROR', payload: e instanceof Error ? e.message : 'Video load failed' });
            }
        };

        fetchVideoSources();
    }, [showId, state.currentEpisode, state.currentMode]);



    const toggleWatchlist = useCallback(async () => {
        if (!state.showMeta || !showId) return;
        const wasIn = state.inWatchlist;
        dispatch({ type: 'SET_STATE', payload: { inWatchlist: !wasIn } });

        try {
            const endpoint = wasIn ? '/api/watchlist/remove' : '/api/watchlist/add';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: showId,
                    name: state.showMeta.name,
                    thumbnail: state.showMeta.thumbnail,
                    nativeName: state.showMeta.names?.native,
                    englishName: state.showMeta.names?.english
                })
            });
            if (!response.ok) throw new Error("Watchlist update failed");
            toast.success(wasIn ? 'Removed from watchlist' : 'Added to watchlist');
        } catch (e) {
            dispatch({ type: 'SET_STATE', payload: { inWatchlist: wasIn } });
            toast.error("Failed to update watchlist");
        }
    }, [showId, state.showMeta, state.inWatchlist]);

    const setPreferredSource = useCallback(async (sourceName: string) => {
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'preferredSource', value: sourceName })
            });
        } catch (e) {
            console.error(e);
        }
    }, []);

    const handleToggleDetails = useCallback(async () => {
        dispatch({ type: 'SET_STATE', payload: { showCombinedDetails: !state.showCombinedDetails } });
        if (state.showCombinedDetails || state.allMangaDetails) return;

        try {
            dispatch({ type: 'SET_LOADING', key: 'loadingDetails', value: true });
            const resp = await fetch(`/api/allmanga-details/${showId}`);
            const data = resp.ok ? await resp.json() : null;
            dispatch({ type: 'SET_STATE', payload: { allMangaDetails: data, loadingDetails: false } });
        } catch (e) {
            console.warn(e);
            dispatch({ type: 'SET_LOADING', key: 'loadingDetails', value: false });
        }
    }, [showId, state.showCombinedDetails, state.allMangaDetails]);


    return {
        state,
        dispatch,
        toggleWatchlist,
        setPreferredSource,
        handleToggleDetails
    };
};