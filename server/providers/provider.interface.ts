export interface Show {
    _id: string;
    id?: string;
    name: string;
    nativeName?: string;
    englishName?: string;
    thumbnail?: string;
    description?: string;
    type?: string;
    availableEpisodesDetail?: {
        sub?: string[];
        dub?: string[];
    };
}

export interface VideoLink {
    resolutionStr: string;
    link: string;
    hls: boolean;
    headers?: Record<string, string>;
}

export interface SubtitleTrack {
    language: string;
    label: string;
    url: string;
}

export interface VideoSource {
    sourceName: string;
    links: VideoLink[];
    subtitles?: SubtitleTrack[];
    type?: 'player' | 'iframe';
}

export interface EpisodeDetails {
    episodes: string[];
    description: string;
}

export interface SkipInterval {
    interval: {
        startTime: number;
        endTime: number;
    };
    skipType: 'op' | 'ed';
    skipId: string;
    episodeLength: number;
}

export interface SkipIntervals {
    found: boolean;
    results: SkipInterval[];
}

export interface SearchOptions {
    query?: string;
    season?: string;
    year?: string;
    sortBy?: string;
    page?: string;
    type?: string;
    country?: string;
    translation?: string;
    genres?: string;
    excludeGenres?: string;
    tags?: string;
    excludeTags?: string;
    studios?: string;
}

export interface ShowDetails {
    status: string;
    nextEpisodeAirDate?: string;
}

export interface AllmangaDetails {
    Rating: string;
    Season: string;
    Episodes: string;
    Date: string;
    "Original Broadcast": string;
}

export interface Provider {
    name: string;
    
    search(options: SearchOptions): Promise<Show[]>;
    getPopular(timeframe: 'daily' | 'weekly' | 'monthly' | 'all'): Promise<Show[]>;
    getSchedule(date: Date): Promise<Show[]>;
    getSeasonal(page: number): Promise<Show[]>;
    getLatestReleases(): Promise<Show[]>;
    
    getShowMeta(showId: string): Promise<Partial<Show> | null>;
    getEpisodes(showId: string, mode: 'sub' | 'dub'): Promise<EpisodeDetails | null>;
    getStreamUrls(showId: string, episodeNumber: string, mode: 'sub' | 'dub'): Promise<VideoSource[] | null>;
    getSkipTimes(showId: string, episodeNumber: string): Promise<SkipIntervals>;
    getShowDetails(showId: string): Promise<ShowDetails>;
    getAllmangaDetails(showId: string): Promise<AllmangaDetails>;
}