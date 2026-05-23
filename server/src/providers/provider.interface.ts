export interface Show {
  _id: string
  id?: string
  name: string
  names?: {
    romaji?: string
    english?: string
    native?: string
    synonyms?: string[]
  }
  nativeName?: string
  englishName?: string
  thumbnail?: string
  bannerImage?: string
  description?: string
  type?: string
  availableEpisodesDetail?: {
    sub?: string[]
    dub?: string[]
    raw?: string[]
  }
  availableEpisodes?: {
    sub?: number
    dub?: number
    raw?: number
  }
  episodeCount?: string | number | null
  episodeDuration?: string | number | null
  averageScore?: number | null
  score?: number
  isAdult?: boolean
  rating?: string
  genres?: { name: string }[]
  tags?: { name: string }[]
  studios?: { name: string }[]
  status?: string
  airedStart?: Record<string, unknown> | null
  airedEnd?: Record<string, unknown> | null
  country?: string | null
  season?: Record<string, unknown> | null
  nextAiring?: {
    episode: number
    timeUntilAiring: number
  }
}

export interface VideoLink {
  resolutionStr: string
  link: string
  hls: boolean
  headers?: Record<string, string>
}

export interface SubtitleTrack {
  language: string
  label: string
  url: string
}

export interface VideoSource {
  sourceName: string
  links: VideoLink[]
  subtitles?: SubtitleTrack[]
  type?: 'player' | 'iframe'
  actualEpisodeNumber?: string
}

export interface EpisodeDetails {
  episodes: string[]
  description: string
}

export interface SkipInterval {
  interval: {
    startTime: number
    endTime: number
  }
  skipType: 'op' | 'ed'
  skipId: string
  episodeLength: number
}

export interface SkipIntervals {
  found: boolean
  results: SkipInterval[]
}

export interface SearchOptions {
  query?: string
  season?: string
  year?: string
  sortBy?: string
  page?: string
  limit?: string
  type?: string
  country?: string
  translation?: string
  genres?: string
  excludeGenres?: string
  tags?: string
  excludeTags?: string
  studios?: string
}

export interface Provider {
  name: string
  search(options: SearchOptions): Promise<Show[]>
  getPopular(
    timeframe: 'daily' | 'weekly' | 'monthly' | 'all',
    page?: number,
    size?: number
  ): Promise<Show[]>
  getSchedule(date: Date): Promise<Show[]>
  getSeasonal(page: number): Promise<Show[]>
  getLatestReleases(page?: number, size?: number): Promise<Show[]>
  getShowMeta(showId: string): Promise<Partial<Show> | null>
  getEpisodes(showId: string, mode: 'sub' | 'dub'): Promise<EpisodeDetails | null>
  getStreamUrls(
    showId: string,
    episodeNumber: string,
    mode: 'sub' | 'dub'
  ): Promise<VideoSource[] | null>
  getSkipTimes(showId: string, episodeNumber: string): Promise<SkipIntervals>
}
