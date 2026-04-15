/**
 * Scraper response types (what the API returns)
 */

import type {
  Anime,
  Top10Anime,
  MostPopularAnime,
  SpotlightAnime,
  TrendingAnime,
  LatestEpisodeAnime,
  TopUpcomingAnime,
  TopAiringAnime,
  MostFavoriteAnime,
  LatestCompletedAnime,
  AnimeGeneralAboutInfo,
  RecommendedAnime,
  RelatedAnime,
  Season,
  AnimeEpisode,
  SubEpisode,
  DubEpisode,
  RawEpisode,
  AnimeSearchSuggestion,
} from './anime.js'

export type ScrapedHomePage = {
  spotlightAnimes: SpotlightAnime[]
  trendingAnimes: TrendingAnime[]
  latestEpisodeAnimes: LatestEpisodeAnime[]
  topUpcomingAnimes: TopUpcomingAnime[]
  top10Animes: {
    today: Top10Anime[]
    week: Top10Anime[]
    month: Top10Anime[]
  }
  topAiringAnimes: TopAiringAnime[]
  mostPopularAnimes: MostPopularAnime[]
  mostFavoriteAnimes: MostFavoriteAnime[]
  latestCompletedAnimes: LatestCompletedAnime[]
  genres: string[]
}

export type ScrapedAnimeCategory = {
  animes: Anime[]
  genres: string[]
  top10Animes: {
    today: Top10Anime[]
    week: Top10Anime[]
    month: Top10Anime[]
  }
  category: string
  totalPages: number
  currentPage: number
  hasNextPage: boolean
}

export type ScrapedAnimeAZList = {
  sortOption: string
  animes: Anime[]
  totalPages: number
  hasNextPage: boolean
  currentPage: number
}

export type ScrapedGenreAnime = {
  genreName: string
  animes: Anime[]
  genres: string[]
  topAiringAnimes: TopAiringAnime[]
  totalPages: number
  hasNextPage: boolean
  currentPage: number
}

export type ScrapedProducerAnime = {
  producerName: string
  animes: Anime[]
  top10Animes: {
    today: Top10Anime[]
    week: Top10Anime[]
    month: Top10Anime[]
  }
  topAiringAnimes: TopAiringAnime[]
  totalPages: number
  hasNextPage: boolean
  currentPage: number
}

export type ScrapedEstimatedSchedule = {
  scheduledAnimes: Array<{
    id: string | null
    time: string | null
    name: string | null
    jname: string | null
    airingTimestamp: number
    secondsUntilAiring: number
    episode: number
  }>
}

export type ScrapedNextEpisodeSchedule = {
  airingISOTimestamp: string | null
  airingTimestamp: number | null
  secondsUntilAiring: number | null
}

export type ScrapedAnimeSearchResult = {
  mostPopularAnimes: MostPopularAnime[]
  animes: Anime[]
  searchQuery: string
  searchFilters: Record<string, string>
  totalPages: number
  currentPage: number
  hasNextPage: boolean
}

export type ScrapedAnimeSearchSuggestion = {
  suggestions: AnimeSearchSuggestion[]
}

export type ScrapedAnimeEpisodes = {
  totalEpisodes: number
  episodes: AnimeEpisode[]
}

export type ScrapedEpisodeServers = {
  sub: SubEpisode[]
  dub: DubEpisode[]
  raw: RawEpisode[]
  episodeNo: number
  episodeId: string
}

export type Video = {
  url: string
  quality?: string
  isM3U8?: boolean
  size?: number
  [x: string]: unknown
}

export type Subtitle = {
  id?: string
  url: string
  lang: string
}

export type Intro = {
  start: number
  end: number
}

export type Outro = {
  start: number
  end: number
}

export type SourceTrack = {
  file: string
  kind?: string
  label?: string
  default?: boolean
}

export type ScrapedAnimeEpisodesSources = {
  sources: Video[]
  subtitles?: Subtitle[]
  intro?: Intro
  outro?: Outro
  tracks?: SourceTrack[]
  headers?: { [k: string]: string }
  download?: string
  embedURL?: string
  server?: string
  anilistID?: number | null
  malID?: number | null
}

export type ScrapedAnimeAboutInfo = {
  mostPopularAnimes: MostPopularAnime[]
  anime: {
    info: AnimeGeneralAboutInfo
    moreInfo: Record<string, string | string[]>
  }
  seasons: Season[]
  relatedAnimes: RelatedAnime[]
  recommendedAnimes: RecommendedAnime[]
}

export type ScrapedAnimeQtipInfo = {
  anime: {
    quality: string | null
    genres: string[]
    aired: string | null
    synonyms: string | null
    status: string | null
    malscore: string | null
    description: string | null
  } & Omit<Anime, 'poster' | 'duration' | 'rating'>
}

export type AnimeCategories =
  | 'most-favorite'
  | 'most-popular'
  | 'subbed-anime'
  | 'dubbed-anime'
  | 'recently-updated'
  | 'recently-added'
  | 'top-upcoming'
  | 'top-airing'
  | 'movie'
  | 'special'
  | 'ova'
  | 'ona'
  | 'tv'
  | 'completed'

export type AnimeServers = 'hd-1' | 'hd-2' | 'megacloud' | 'streamsb' | 'streamtape'

export type EpisodeCategory = 'sub' | 'dub' | 'raw'
