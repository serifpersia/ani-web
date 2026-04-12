import axios from 'axios'
import logger from '../logger'
import {
  Provider,
  Show,
  VideoSource,
  EpisodeDetails,
  SkipIntervals,
  VideoLink,
  SubtitleTrack,
  SearchOptions,
  ShowDetails,
  AllmangaDetails,
} from './provider.interface'
import * as cheerio from 'cheerio'
import NodeCache from 'node-cache'

const API_BASE_URL = 'https://allanime.day'
const API_ENDPOINT = `https://api.allanime.day/api`
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
const REFERER = 'https://allmanga.to'

const DEOBFUSCATION_MAP: { [key: string]: string } = {
  '79': 'A',
  '7a': 'B',
  '7b': 'C',
  '7c': 'D',
  '7d': 'E',
  '7e': 'F',
  '7f': 'G',
  '70': 'H',
  '71': 'I',
  '72': 'J',
  '73': 'K',
  '74': 'L',
  '75': 'M',
  '76': 'N',
  '77': 'O',
  '68': 'P',
  '69': 'Q',
  '6a': 'R',
  '6b': 'S',
  '6c': 'T',
  '6d': 'U',
  '6e': 'V',
  '6f': 'W',
  '60': 'X',
  '61': 'Y',
  '62': 'Z',
  '59': 'a',
  '5a': 'b',
  '5b': 'c',
  '5c': 'd',
  '5d': 'e',
  '5e': 'f',
  '5f': 'g',
  '50': 'h',
  '51': 'i',
  '52': 'j',
  '53': 'k',
  '54': 'l',
  '55': 'm',
  '56': 'n',
  '57': 'o',
  '48': 'p',
  '49': 'q',
  '4a': 'r',
  '4b': 's',
  '4c': 't',
  '4d': 'u',
  '4e': 'v',
  '4f': 'w',
  '40': 'x',
  '41': 'y',
  '42': 'z',
  '08': '0',
  '09': '1',
  '0a': '2',
  '0b': '3',
  '0c': '4',
  '0d': '5',
  '0e': '6',
  '0f': '7',
  '00': '8',
  '01': '9',
  '15': '-',
  '16': '.',
  '67': '_',
  '46': '~',
  '02': ':',
  '17': '/',
  '07': '?',
  '1b': '#',
  '63': '[',
  '65': ']',
  '78': '@',
  '19': '!',
  '1c': '$',
  '1e': '&',
  '10': '(',
  '11': ')',
  '12': '*',
  '13': '+',
  '14': ',',
  '03': ';',
  '05': '=',
  '1d': '%',
}

interface RawClockLink {
  link: string
  hls?: boolean
  resolutionStr?: string
  headers?: Record<string, string>
  subtitles?: {
    lang?: string
    language?: string
    label?: string
    src?: string
    url?: string
  }[]
}

interface RawClockData {
  links: RawClockLink[]
}

export class AllAnimeProvider implements Provider {
  name = 'AllAnime'
  private cache: NodeCache

  constructor(cache: NodeCache) {
    this.cache = cache
  }

  private deobfuscateStreamUrl(obfuscatedUrl: string): string {
    if (!obfuscatedUrl) return ''
    if (!obfuscatedUrl.startsWith('--')) return obfuscatedUrl

    const sliced = obfuscatedUrl.slice(2)
    let deobfuscated = ''
    for (let i = 0; i < sliced.length; i += 2) {
      const chunk = sliced.substring(i, i + 2)
      deobfuscated += DEOBFUSCATION_MAP[chunk] || chunk
    }

    // Normalize any accidental double slashes
    deobfuscated = deobfuscated.replace(/([^:]\/)\/+/g, '$1')

    // AllAnime stream URLs are relative to the main domain
    if (deobfuscated.startsWith('/')) {
      return `${API_BASE_URL}${deobfuscated}`
    }

    return deobfuscated
  }

  public deobfuscateUrl(obfuscatedUrl: string): string {
    if (!obfuscatedUrl) return ''
    let finalUrl = obfuscatedUrl

    if (!obfuscatedUrl.startsWith('--') && obfuscatedUrl.includes('s4.anilist.co')) {
      finalUrl = obfuscatedUrl.replace(
        'https://s4.anilist.co',
        'https://wp.youtube-anime.com/s4.anilist.co'
      )
    } else if (obfuscatedUrl.startsWith('--')) {
      obfuscatedUrl = obfuscatedUrl.slice(2)
      let deobfuscated = ''
      for (let i = 0; i < obfuscatedUrl.length; i += 2) {
        const chunk = obfuscatedUrl.substring(i, i + 2)
        deobfuscated += DEOBFUSCATION_MAP[chunk] || chunk
      }
      if (deobfuscated.startsWith('/')) {
        finalUrl = `https://wp.youtube-anime.com${deobfuscated}`
      } else {
        finalUrl = deobfuscated
      }
    }

    if (finalUrl.startsWith('http://') || finalUrl.startsWith('https://')) {
      return finalUrl
    }
    return finalUrl
  }

  private async _fetchShows(
    variables: Record<string, unknown>,
    extensions?: Record<string, unknown>
  ): Promise<Show[]> {
    const body: Record<string, unknown> = { variables }
    const fullQuery = `
      query ($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) {
        shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) {
          edges { _id name nativeName englishName thumbnail description type availableEpisodesDetail }
        }
      }`

    if (extensions) {
      body.extensions = extensions
    } else {
      body.query = fullQuery
    }

    try {
      const response = await axios.post(API_ENDPOINT, body, {
        headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
        timeout: 15000,
      })

      if (response.data.errors && response.data.errors[0]?.message === 'PersistedQueryNotFound') {
        throw new Error('PersistedQueryNotFound')
      }

      const shows = response.data?.data?.shows?.edges || []
      return shows.map((show: Show) => ({
        ...show,
        thumbnail: this.deobfuscateUrl(show.thumbnail || ''),
      }))
    } catch (error: unknown) {
      const err = error as { message?: string }
      if (err.message === 'PersistedQueryNotFound' && extensions) {
        logger.info('Search hash expired, falling back to full query')
        const response = await axios.post(
          API_ENDPOINT,
          {
            variables,
            query: fullQuery,
          },
          {
            headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
            timeout: 15000,
          }
        )
        const shows = response.data?.data?.shows?.edges || []
        return shows.map((show: Show) => ({
          ...show,
          thumbnail: this.deobfuscateUrl(show.thumbnail || ''),
        }))
      }
      throw error
    }
  }

  async search(options: SearchOptions): Promise<Show[]> {
    const {
      query,
      season,
      year,
      sortBy,
      page,
      type,
      country,
      translation,
      genres,
      excludeGenres,
      tags,
      excludeTags,
      studios,
    } = options
    const searchObj: { [key: string]: unknown } = { allowAdult: false }
    if (query) searchObj.query = query
    if (season && season !== 'ALL') searchObj.season = season
    if (year && year !== 'ALL') searchObj.year = parseInt(year as string)
    if (sortBy) searchObj.sortBy = sortBy
    if (type && type !== 'ALL') searchObj.types = [type]
    if (genres) searchObj.genres = (genres as string).split(',')
    if (excludeGenres) searchObj.excludeGenres = (excludeGenres as string).split(',')
    if (tags) searchObj.tags = (tags as string).split(',')
    if (studios) searchObj.studios = (studios as string).split(',')
    if (excludeTags) searchObj.excludeTags = (excludeTags as string).split(',')

    const variables = {
      search: searchObj,
      limit: 28,
      page: parseInt(page as string) || 1,
      translationType: translation && translation !== 'ALL' ? translation : 'sub',
      countryOrigin: country && country !== 'ALL' ? country : 'ALL',
    }
    const extensions = {
      persistedQuery: {
        version: 1,
        sha256Hash: 'a24c500a1b765c68ae1d8dd85174931f661c71369c89b92b88b75a725afc471c',
      },
    }
    return this._fetchShows(variables, extensions)
  }

  async getPopular(timeframe: 'daily' | 'weekly' | 'monthly' | 'all'): Promise<Show[]> {
    let dateRange
    switch (timeframe) {
      case 'daily':
        dateRange = 1
        break
      case 'weekly':
        dateRange = 7
        break
      case 'monthly':
        dateRange = 30
        break
      case 'all':
        dateRange = 0
        break
    }
    const variables = {
      type: 'anime',
      size: 10,
      page: 1,
      allowAdult: false,
      allowUnknown: false,
      dateRange: dateRange,
    }
    const extensions = {
      persistedQuery: {
        version: 1,
        sha256Hash: '60f50b84bb545fa25ee7f7c8c0adbf8f5cea40f7b1ef8501cbbff70e38589489',
      },
    }

    try {
      const response = await axios.post(
        API_ENDPOINT,
        { variables, extensions },
        {
          headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
          timeout: 15000,
        }
      )

      if (response.data.errors && response.data.errors[0]?.message === 'PersistedQueryNotFound') {
        throw new Error('PersistedQueryNotFound')
      }

      const recommendations = response.data?.data?.queryPopular?.recommendations || []
      return recommendations.map((rec: { anyCard: Show }) => {
        const card = rec.anyCard
        return { ...card, thumbnail: this.deobfuscateUrl(card.thumbnail || '') }
      })
    } catch (error: unknown) {
      const err = error as { message?: string }
      if (err.message === 'PersistedQueryNotFound') {
        logger.info('Popular hash expired, falling back to full query')
        const fullQuery = `
          query ($type: VaildPopularTypeEnumType!, $size: Int!, $dateRange: Int, $page: Int, $allowAdult: Boolean, $allowUnknown: Boolean) {
            queryPopular(type: $type, size: $size, dateRange: $dateRange, page: $page, allowAdult: $allowAdult, allowUnknown: $allowUnknown) {
              recommendations {
                anyCard {
                  _id
                  name
                  nativeName
                  englishName
                  thumbnail
                  type
                  availableEpisodesDetail
                }
              }
            }
          }
          `
        const response = await axios.post(
          API_ENDPOINT,
          { query: fullQuery, variables },
          {
            headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
            timeout: 15000,
          }
        )
        const recommendations = response.data?.data?.queryPopular?.recommendations || []
        return recommendations.map((rec: { anyCard: Show }) => {
          const card = rec.anyCard
          return { ...card, thumbnail: this.deobfuscateUrl(card.thumbnail || '') }
        })
      }
      throw error
    }
  }

  async getSchedule(date: Date): Promise<Show[]> {
    const startOfDay = new Date(date)
    startOfDay.setUTCHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setUTCHours(23, 59, 59, 999)
    const variables = {
      search: {
        dateRangeStart: Math.floor(startOfDay.getTime() / 1000),
        dateRangeEnd: Math.floor(endOfDay.getTime() / 1000),
        sortBy: 'Latest_Update',
      },
      limit: 50,
      page: 1,
      translationType: 'sub',
      countryOrigin: 'ALL',
    }
    return this._fetchShows(variables)
  }
  async getSeasonal(page: number): Promise<Show[]> {
    const month = new Date().getMonth()
    const season =
      month >= 0 && month <= 2
        ? 'Winter'
        : month >= 3 && month <= 5
          ? 'Spring'
          : month >= 6 && month <= 8
            ? 'Summer'
            : 'Fall'
    const year = new Date().getFullYear()
    const variables = {
      search: { year, season, sortBy: 'Latest_Update', allowAdult: false },
      limit: 25,
      page: page,
      translationType: 'sub',
      countryOrigin: 'JP',
    }
    return this._fetchShows(variables)
  }
  async getLatestReleases(): Promise<Show[]> {
    const variables = {
      search: { sortBy: 'Latest_Update', allowAdult: false },
      limit: 14,
      page: 1,
      translationType: 'sub',
      countryOrigin: 'JP',
    }
    return this._fetchShows(variables)
  }

  async getShowMeta(showId: string): Promise<Partial<Show> | null> {
    const response = await axios.post(
      API_ENDPOINT,
      {
        query: `query($showId: String!) { show(_id: $showId) { name, thumbnail, nativeName, englishName, availableEpisodesDetail, score } }`,
        variables: { showId },
      },
      {
        headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
        timeout: 15000,
      }
    )
    const show = response.data.data.show
    if (show) {
      return {
        name: show.name,
        thumbnail: this.deobfuscateUrl(show.thumbnail),
        nativeName: show.nativeName,
        englishName: show.englishName,
        availableEpisodesDetail: show.availableEpisodesDetail,
        score: show.score,
      }
    }
    return null
  }

  async getEpisodes(showId: string, mode: 'sub' | 'dub'): Promise<EpisodeDetails | null> {
    const cacheKey = `episodes-${showId}-${mode}`
    const cachedData = this.cache.get<EpisodeDetails>(cacheKey)
    if (cachedData) {
      return cachedData
    }

    const response = await axios.post(
      API_ENDPOINT,
      {
        query: `query($showId: String!) { show(_id: $showId) { availableEpisodesDetail, description } }`,
        variables: { showId },
      },
      {
        headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
        timeout: 15000,
      }
    )
    const showData = response.data.data.show
    if (showData) {
      const episodeDetails = {
        episodes: (showData.availableEpisodesDetail[mode] as string[]) || [],
        description: showData.description,
      }
      this.cache.set(cacheKey, episodeDetails)
      return episodeDetails
    }
    return null
  }

  async getSkipTimes(showId: string, episodeNumber: string): Promise<SkipIntervals> {
    try {
      const malIdResponse = await axios.post(
        API_ENDPOINT,
        {
          query: `query($showId: String!) { show(_id: $showId) { malId } }`,
          variables: { showId },
        },
        {
          headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
          timeout: 10000,
        }
      )
      const malId = malIdResponse.data?.data?.show?.malId
      if (!malId) return { found: false, results: [] }
      const response = await axios.get(
        `https://api.aniskip.com/v1/skip-times/${malId}/${episodeNumber}?types=op&types=ed`,
        {
          headers: { 'User-Agent': USER_AGENT },
          timeout: 5000,
        }
      )
      return response.data
    } catch {
      return { found: false, results: [] }
    }
  }

  async getStreamUrls(
    showId: string,
    episodeNumber: string,
    mode: 'sub' | 'dub'
  ): Promise<VideoSource[] | null> {
    const { data } = await axios.post(
      API_ENDPOINT,
      {
        query: `query($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode(showId: $showId, translationType: $translationType, episodeString: $episodeString) { sourceUrls } }`,
        variables: { showId, translationType: mode, episodeString: episodeNumber },
      },
      {
        headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
        timeout: 15000,
      }
    )

    const sourceUrls = data.data.episode?.sourceUrls
    if (!Array.isArray(sourceUrls)) return null

    const supportedSources = [
      'Yt-mp4',
      'S-mp4',
      'Luf-Mp4',
      'wixmp',
      'Default',
      'Fm-Hls',
      'Vg',
      'Sw',
      'Mp4',
      'Ok',
    ]

    const filteredSources = sourceUrls
      .filter((s: { sourceName: string }) => supportedSources.includes(s.sourceName))
      .sort(
        (a: { priority?: number }, b: { priority?: number }) =>
          (b.priority || 0) - (a.priority || 0)
      )

    const processedSources: VideoSource[] = []

    for (const source of filteredSources as {
      sourceName: string
      sourceUrl: string
      type?: string
      priority?: number
    }[]) {
      try {
        if (['Yt-mp4', 'S-mp4', 'Luf-Mp4', 'wixmp', 'Default'].includes(source.sourceName)) {
          if (!source.sourceUrl.startsWith('--')) continue

          let videoLinks: VideoLink[] = []
          let subtitles: SubtitleTrack[] = []

          let decryptedUrl = this.deobfuscateStreamUrl(source.sourceUrl)

          if (decryptedUrl.includes('/clock') && !decryptedUrl.includes('.json')) {
            decryptedUrl = decryptedUrl.replace('/clock', '/clock.json')
          }

          if (decryptedUrl.includes('/clock.json')) {
            const finalUrl = decryptedUrl.startsWith('http')
              ? decryptedUrl
              : new URL(decryptedUrl, API_BASE_URL).href

            let clockData: RawClockData | null = null
            for (let retry = 0; retry < 2; retry++) {
              try {
                const resp = await axios.get(finalUrl, {
                  headers: { Referer: REFERER, 'User-Agent': USER_AGENT },
                  timeout: 10000,
                })
                clockData = resp.data
                if (clockData && clockData !== ('error' as unknown)) break
              } catch (e) {
                if (retry === 1)
                  logger.error({ err: e, sourceName: source.sourceName }, 'Clock.json fetch failed')
              }
            }

            if (clockData && Array.isArray(clockData.links) && clockData.links.length > 0) {
              const linkData = clockData.links[0]
              if (linkData.hls) {
                try {
                  const hlsResp = await axios.get(linkData.link, {
                    headers: linkData.headers || { Referer: REFERER },
                    responseType: 'text',
                    timeout: 10000,
                  })
                  const lines = (hlsResp.data as string).split('\n')
                  for (let i = 0; i < lines.length; i++) {
                    if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                      const resMatch = lines[i].match(/RESOLUTION=\d+x(\d+)/)
                      videoLinks.push({
                        resolutionStr: resMatch ? `${resMatch[1]}p` : 'Auto',
                        link: new URL(lines[i + 1], linkData.link).href,
                        hls: true,
                        headers: linkData.headers || { Referer: REFERER },
                      })
                    }
                  }
                } catch (e) {
                  logger.error(
                    { err: e, sourceName: source.sourceName },
                    'Failed to parse HLS master playlist'
                  )
                }

                if (videoLinks.length === 0) {
                  videoLinks.push({
                    resolutionStr: 'Auto',
                    link: linkData.link,
                    hls: true,
                    headers: linkData.headers || { Referer: REFERER },
                  })
                }
              } else if (Array.isArray(clockData.links)) {
                videoLinks = clockData.links.map((l: RawClockLink) => ({
                  resolutionStr: l.resolutionStr || 'Default',
                  link:
                    l.link && typeof l.link === 'string' && l.link.startsWith('/')
                      ? `https://wp.youtube-anime.com${l.link}`
                      : l.link,
                  hls: !!l.hls,
                  headers: l.headers || { Referer: REFERER },
                }))
              }

              if (Array.isArray(linkData.subtitles)) {
                subtitles = linkData.subtitles.map((s) => ({
                  language: s.lang || s.language || 'en',
                  label: s.label || 'Subtitle',
                  url:
                    s.src && typeof s.src === 'string' && s.src.startsWith('/')
                      ? `https://wp.youtube-anime.com${s.src}`
                      : s.src || s.url || '',
                }))
              }
            }
          }

          // Fallback if clock.json failed or provided no links
          if (videoLinks.length === 0) {
            const fallbackUrl = decryptedUrl
            videoLinks.push({
              resolutionStr: 'Default',
              link: fallbackUrl,
              hls: fallbackUrl.includes('.m3u8'),
              headers: { Referer: REFERER },
            })
          }

          processedSources.push({
            sourceName: source.sourceName,
            links: videoLinks,
            subtitles,
            type: 'player',
          })
        } else {
          // Handle iframe-like sources and Fm-Hls
          processedSources.push({
            sourceName: source.sourceName,
            links: [
              {
                resolutionStr: 'iframe',
                link: source.sourceUrl,
                hls: false,
              },
            ],
            type:
              source.type === 'iframe' ||
              source.sourceName === 'Fm-Hls' ||
              ['Vg', 'Sw', 'Ok'].includes(source.sourceName)
                ? 'iframe'
                : 'player',
          })
        }
      } catch (e) {
        logger.error({ err: e, sourceName: source.sourceName }, `Failed to process source`)
      }
    }

    return processedSources
  }

  async getShowDetails(showId: string): Promise<ShowDetails> {
    const metaQuery = `query($showId: String!) { show(_id: $showId) { name } }`
    const metaResponse = await axios.post(
      API_ENDPOINT,
      { query: metaQuery, variables: { showId } },
      {
        headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
        timeout: 10000,
      }
    )
    const showName = metaResponse.data?.data?.show?.name

    if (!showName) {
      throw new Error('Show not found')
    }

    const scheduleSearchUrl = `https://animeschedule.net/api/v3/anime?q=${encodeURIComponent(showName)}`
    const scheduleResponse = await axios.get(scheduleSearchUrl, { timeout: 10000 })
    const firstResult = scheduleResponse.data?.anime?.[0]
    if (firstResult) {
      if (firstResult.status === 'Ongoing') {
        try {
          const pageResponse = await axios.get(
            `https://animeschedule.net/anime/${firstResult.route}`,
            { timeout: 10000 }
          )
          const countdownMatch = pageResponse.data.match(/countdown-time" datetime="([^"]*)"/)
          if (countdownMatch) {
            firstResult.nextEpisodeAirDate = countdownMatch[1]
          }
        } catch (_e) {
          logger.warn({ err: _e }, 'Failed to scrape for nextEpisodeAirDate')
        }
      }
      return firstResult
    }
    throw new Error('Not Found on Schedule')
  }

  async getAllmangaDetails(showId: string): Promise<AllmangaDetails> {
    const url = `https://allmanga.to/bangumi/${showId}`
    const headers = {
      'User-Agent': USER_AGENT,
      Referer: REFERER,
    }

    const response = await axios.get(url, { headers })
    const $ = cheerio.load(response.data)

    const details: AllmangaDetails = {
      Rating: 'N/A',
      Season: 'N/A',
      Episodes: 'N/A',
      Date: 'N/A',
      'Original Broadcast': 'N/A',
    }

    $('.info-season').each((_i, elem) => {
      const label = $(elem).find('h4').text().trim() as keyof AllmangaDetails
      const value = $(elem).find('li').text().trim()
      if (Object.prototype.hasOwnProperty.call(details, label)) {
        details[label] = value
      }
    })
    return details
  }
}
