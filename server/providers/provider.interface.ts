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

export interface SkipIntervals {
    found: boolean;
    results: any[];
}

export interface Provider {
    name: string;
    
    search(options: any): Promise<Show[]>;
    getPopular(timeframe: 'daily' | 'weekly' | 'monthly' | 'all'): Promise<Show[]>;
    getSchedule(date: Date): Promise<Show[]>;
    getSeasonal(page: number): Promise<Show[]>;
    getLatestReleases(): Promise<Show[]>;
    
    getShowMeta(showId: string): Promise<Partial<Show> | null>;
    getEpisodes(showId: string, mode: 'sub' | 'dub'): Promise<EpisodeDetails | null>;
    getStreamUrls(showId: string, episodeNumber: string, mode: 'sub' | 'dub'): Promise<VideoSource[] | null>;
    getSkipTimes(showId: string, episodeNumber: string): Promise<SkipIntervals>;
    getShowDetails(showId: string): Promise<any>;
    getAllmangaDetails(showId: string): Promise<any>;
}