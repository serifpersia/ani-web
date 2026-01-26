
export interface SimpleShowMeta {
    name: string;
    thumbnail: string;
    description?: string;
    names?: {
        romaji: string;
        english: string;
        native: string;
    };
}

export interface DetailedShowMeta {
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

export interface AllMangaDetail {
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
    src?: string;
    lang: string;
    label: string;
    mode?: 'showing' | 'hidden' | 'disabled';
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

export interface PlayerState {
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