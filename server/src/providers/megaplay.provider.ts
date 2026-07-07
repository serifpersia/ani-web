import NodeCache from 'node-cache'
import {
  Provider,
  Show,
  VideoSource,
  EpisodeDetails,
  SkipIntervals,
  SearchOptions,
} from './provider.interface'
import logger from '../logger'

interface AniListTitle {
  romaji?: string
  english?: string
  native?: string
}

interface AniListMedia {
  id: number
  idMal?: number | null
  title?: AniListTitle
  coverImage?: { large?: string }
  format?: string
  seasonYear?: number | null
  episodes?: number | null
  description?: string | null
  status?: string
  genres?: string[]
  averageScore?: number | null
}

interface AniListPage {
  media?: AniListMedia[]
  airingSchedule?: { media?: AniListMedia }[]
}

interface AniListResponse {
  data?: {
    Page?: AniListPage
    Media?: AniListMedia
  }
  errors?: { message: string }[]
}

export class MegaPlayProvider implements Provider {
  name = 'MegaPlay'
  private anilistBase = 'https://graphql.anilist.co'
  private megaPlayBase = 'https://megaplay.buzz/stream/mal'
  private cache: NodeCache

  constructor(cache: NodeCache) {
    this.cache = cache
  }

  private async anilistRequest(
    query: string,
    variables: Record<string, unknown>
  ): Promise<AniListResponse['data'] | null> {
    try {
      const response = await fetch(this.anilistBase, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      })

      if (!response.ok) return null

      const json = (await response.json()) as AniListResponse
      if (json.errors && json.errors.length > 0) {
        return null
      }

      return json.data ?? null
    } catch (error) {
      logger.error({ error }, '[MegaPlay] AniList request failed')
      return null
    }
  }

  private stripHtml(input?: string | null): string {
    if (!input) return ''
    return input
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim()
  }

  private toShow(media: AniListMedia): Show {
    const id = (media.idMal ?? media.id).toString()
    const title = media.title
    const name = title?.romaji || title?.english || title?.native || 'Unknown'

    return {
      _id: id,
      id,
      name,
      englishName: title?.english,
      nativeName: title?.native,
      names: {
        romaji: title?.romaji,
        english: title?.english,
        native: title?.native,
      },
      thumbnail: media.coverImage?.large,
      type: media.format,
      year: media.seasonYear ?? null,
      episodeCount: media.episodes ?? null,
      description: this.stripHtml(media.description),
      status: media.status,
      genres: media.genres?.map((g) => ({ name: g })),
      score: media.averageScore ?? null,
    }
  }

  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private bestMatch(results: AniListMedia[], query: string): AniListMedia {
    const q = this.normalizeTitle(query)
    let best = results[0]
    let bestScore = -1

    for (const anime of results) {
      const title = anime.title ? this.normalizeTitle(anime.title.romaji || '') : ''
      const englishTitle = anime.title?.english ? this.normalizeTitle(anime.title.english) : ''
      const nativeTitle = anime.title?.native ? this.normalizeTitle(anime.title.native) : ''
      let score = -1

      if (title === q || englishTitle === q || nativeTitle === q) {
        score = 3
      } else if (title.startsWith(q) || englishTitle.startsWith(q) || nativeTitle.startsWith(q)) {
        score = 2
      } else if (title.includes(q) || englishTitle.includes(q) || nativeTitle.includes(q)) {
        score = 1
      }

      if (score > bestScore) {
        bestScore = score
        best = anime
        if (score === 3) break
      }
    }

    return best
  }

  private mediaFields = `
    id
    idMal
    title { romaji english native }
    coverImage { large }
    format
    seasonYear
    episodes
    description
    status
    genres
    averageScore
  `

  async search(options: SearchOptions): Promise<Show[]> {
    try {
      const rawQuery = options.query || ''
      const query = rawQuery.replace(/[""]/g, '').replace(/[']/g, '').replace(/\s+/g, ' ').trim()
      if (!query) return []

      const gql = `query ($q: String, $page: Int, $perPage: Int) {
        Page (page: $page, perPage: $perPage) {
          media (search: $q, type: ANIME) {
            ${this.mediaFields}
          }
        }
      }`

      const data = await this.anilistRequest(gql, { q: query, page: 1, perPage: 20 })
      const media = data?.Page?.media
      if (!media || media.length === 0) return []

      const results = media.map((m) => this.toShow(m))

      if (results.length > 0) {
        const best = this.bestMatch(media, query)
        const bestIndex = media.findIndex((m) => (m.idMal ?? m.id) === (best.idMal ?? best.id))
        if (bestIndex > 0) {
          const [bestItem] = results.splice(bestIndex, 1)
          results.unshift(bestItem)
        }
      }

      return results
    } catch (error) {
      logger.error({ error }, 'MegaPlay (AniList) search failed')
      return []
    }
  }

  async getEpisodes(showId: string, _mode: 'sub' | 'dub'): Promise<EpisodeDetails | null> {
    try {
      if (!/^\d+$/.test(showId)) return null

      const cacheKey = `megaplay_eps_${showId}`
      const cached = this.cache.get<EpisodeDetails>(cacheKey)
      if (cached) return cached

      const gql = `query ($idMal: Int) {
        Media (idMal: $idMal, type: ANIME) {
          episodes
          status
        }
      }`

      const data = await this.anilistRequest(gql, { idMal: Number(showId) })
      const media = data?.Media
      if (!media) return null

      const episodeCount = media.episodes || 0
      let count = episodeCount
      if (count === 0) {
        if (media.status === 'RELEASING' || media.status === 'FINISHED') {
          count = 12
        }
      }

      const episodes = Array.from({ length: count }, (_, i) => (i + 1).toString())

      const result: EpisodeDetails = {
        episodes,
        description: '',
      }

      this.cache.set(cacheKey, result, 86400)
      return result
    } catch (error) {
      logger.error({ error, showId }, 'MegaPlay getEpisodes failed')
      return null
    }
  }

  async getStreamUrls(
    showId: string,
    episodeNumber: string,
    mode: 'sub' | 'dub'
  ): Promise<VideoSource[] | null> {
    if (!/^\d+$/.test(showId)) return null

    let targetEpisode = episodeNumber
    if (episodeNumber === '0') {
      targetEpisode = '1'
    }

    const streamUrl = `${this.megaPlayBase}/${showId}/${targetEpisode}/${mode}`

    return [
      {
        sourceName: `MegaPlay (${mode.toUpperCase()})`,
        links: [
          {
            resolutionStr: 'Auto',
            link: streamUrl,
            hls: false,
          },
        ],
        type: 'iframe',
        actualEpisodeNumber: targetEpisode,
      },
    ]
  }

  async getShowMeta(showId: string): Promise<Partial<Show> | null> {
    try {
      if (!/^\d+$/.test(showId)) return null

      const gql = `query ($idMal: Int) {
        Media (idMal: $idMal, type: ANIME) {
          ${this.mediaFields}
        }
      }`

      const data = await this.anilistRequest(gql, { idMal: Number(showId) })
      const media = data?.Media
      if (!media) return null

      return this.toShow(media)
    } catch (error) {
      logger.error({ error, showId }, 'MegaPlay getShowMeta failed')
      return null
    }
  }

  async getPopular(
    _timeframe: 'daily' | 'weekly' | 'monthly' | 'all',
    page?: number,
    size?: number
  ): Promise<Show[]> {
    try {
      const gql = `query ($page: Int, $perPage: Int) {
        Page (page: $page, perPage: $perPage) {
          media (sort: POPULARITY_DESC, type: ANIME) {
            ${this.mediaFields}
          }
        }
      }`

      const data = await this.anilistRequest(gql, { page: page || 1, perPage: size || 10 })
      const media = data?.Page?.media
      if (!media) return []

      return media.map((m) => this.toShow(m))
    } catch {
      return []
    }
  }

  async getSchedule(date: Date): Promise<Show[]> {
    try {
      const dayStart = Math.floor(date.getTime() / 1000)
      const dayEnd = dayStart + 86400

      const gql = `query ($dayStart: Int, $dayEnd: Int) {
        Page (perPage: 50) {
          airingSchedule (airingAt_greater: $dayStart, airingAt_lesser: $dayEnd) {
            media {
              ${this.mediaFields}
            }
          }
        }
      }`

      const data = await this.anilistRequest(gql, { dayStart, dayEnd })
      const schedule = data?.Page?.airingSchedule
      if (!schedule) return []

      const seen = new Set<number>()
      const results: Show[] = []
      for (const entry of schedule) {
        const media = entry.media
        if (!media) continue
        const key = media.idMal ?? media.id
        if (seen.has(key)) continue
        seen.add(key)
        results.push(this.toShow(media))
      }

      return results
    } catch {
      return []
    }
  }

  async getSeasonal(page: number): Promise<Show[]> {
    try {
      const now = new Date()
      const month = now.getMonth() + 1
      let season: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL'
      let year = now.getFullYear()
      if (month === 12 || month <= 2) {
        season = 'WINTER'
        if (month === 12) year += 1
      } else if (month <= 5) {
        season = 'SPRING'
      } else if (month <= 8) {
        season = 'SUMMER'
      } else {
        season = 'FALL'
      }

      const gql = `query ($page: Int, $perPage: Int, $season: MediaSeason, $year: Int) {
        Page (page: $page, perPage: $perPage) {
          media (season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC) {
            ${this.mediaFields}
          }
        }
      }`

      const data = await this.anilistRequest(gql, {
        page,
        perPage: 20,
        season,
        year,
      })
      const media = data?.Page?.media
      if (!media) return []

      return media.map((m) => this.toShow(m))
    } catch {
      return []
    }
  }

  async getLatestReleases(page?: number, size?: number): Promise<Show[]> {
    try {
      const gql = `query ($page: Int, $perPage: Int) {
        Page (page: $page, perPage: $perPage) {
          media (status: RELEASING, sort: POPULARITY_DESC, type: ANIME) {
            ${this.mediaFields}
          }
        }
      }`

      const data = await this.anilistRequest(gql, { page: page || 1, perPage: size || 10 })
      const media = data?.Page?.media
      if (!media) return []

      return media.map((m) => this.toShow(m))
    } catch {
      return []
    }
  }

  async getSkipTimes(_showId: string, _episodeNumber: string): Promise<SkipIntervals> {
    return { found: false, results: [] }
  }
}
