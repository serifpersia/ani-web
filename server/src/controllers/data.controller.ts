import { Request, Response } from 'express'
import { Provider, Show } from '../providers/provider.interface'
import { AllAnimeProvider } from '../providers/allanime.provider'
import { genres, tags, studios } from '../constants.json'
import {
  getTrending,
  getLatestReleases,
  getSeasonal,
  getShowMetaById,
  getAnilistEpisodes,
  getSchedule,
  searchAnilist,
} from '../lib/anilist'
import { getMigratedId } from '../lib/migration'
import { ShowsMetaRepository } from '../repositories/shows-meta.repository'
import logger from '../logger'

export class DataController {
  constructor(private providers: { [key: string]: Provider }) {}

  private getProvider(req: Request): Provider {
    const providerName = (req.query.provider as string) || 'allanime'
    return this.providers[providerName.toLowerCase()] || this.providers['allanime']
  }

  getTrending = async (_req: Request, res: Response) => {
    try {
      const data = await getTrending(1, 20, 'TRENDING_DESC', 'RELEASING')
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (e) {
      logger.error({ err: e }, 'Trending fetch failed')
      res.json([])
    }
  }

  getPopularList = async (req: Request, res: Response) => {
    const sort =
      (req.query.sort as string) === 'POPULARITY_DESC' ? 'POPULARITY_DESC' : 'TRENDING_DESC'
    const page = parseInt(req.query.page as string) || 1
    const size = parseInt(req.query.size as string) || 20
    try {
      const data = await getTrending(page, size, sort)
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (e) {
      logger.error({ err: e }, 'Popular list fetch failed')
      res.json([])
    }
  }

  getPopular = async (req: Request, res: Response) => {
    const timeframe = (req.params.timeframe as string).toLowerCase() as
      | 'daily'
      | 'weekly'
      | 'monthly'
      | 'all'
    const page = parseInt(req.query.page as string) || 1
    const size = parseInt(req.query.size as string) || 10
    try {
      const data = await this.getProvider(req).getPopular(timeframe, page, size)
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (e) {
      if ((e as Error).message === 'AUTH_REQUIRED') {
        return res.status(403).json({ error: 'AUTH_REQUIRED', provider: 'animepahe' })
      }
      throw e
    }
  }

  getSchedule = async (req: Request, res: Response) => {
    try {
      const date = new Date(req.params.date + 'T00:00:00.000Z')
      const format = (req.query.format as string) || undefined
      const data = await getSchedule(date, format)
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (e) {
      logger.error({ err: e, date: req.params.date }, 'Schedule fetch failed')
      res.json([])
    }
  }

  getSkipTimes = async (req: Request, res: Response) => {
    try {
      const showId = req.params.showId as string
      const episodeNumber = req.params.episodeNumber as string
      if (/^\d+$/.test(showId)) {
        const skipRes = await fetch(
          `https://api.aniskip.com/v1/skip-times/${showId}/${episodeNumber}?types=op&types=ed`
        )
        if (skipRes.ok) {
          const data = await skipRes.json()
          return res.json(data)
        }
      }
      const data = await this.getProvider(req).getSkipTimes(showId, episodeNumber)
      res.json(data)
    } catch {
      res.json({ found: false, results: [] })
    }
  }

  getVideo = async (req: Request, res: Response) => {
    try {
      let showId = req.query.showId as string
      const providerName = req.query.provider as string

      const providerKey = providerName?.toLowerCase()
      if (providerKey && /^\d+$/.test(showId) && providerKey !== 'megaplay') {
        const meta = (await ShowsMetaRepository.getById(req.db, showId)) as {
          name?: string
          englishName?: string
        } | null
        let targetTitle = meta?.name || meta?.englishName
        let anilistShow: Show | null = null

        if (!targetTitle) {
          try {
            anilistShow = await getShowMetaById(showId)
            targetTitle = anilistShow?.name || anilistShow?.englishName

            if (anilistShow && targetTitle) {
              await ShowsMetaRepository.upsert(req.db, {
                id: showId,
                name: anilistShow.name,
                thumbnail: anilistShow.thumbnail,
                nativeName: anilistShow.nativeName,
                englishName: anilistShow.englishName,
                genres: anilistShow.genres
                  ? JSON.stringify(anilistShow.genres.map((genre) => genre.name))
                  : undefined,
                status: anilistShow.status,
                episodeCount:
                  anilistShow.episodeCount != null ? Number(anilistShow.episodeCount) : undefined,
                type: anilistShow.type,
                anilistId: anilistShow.anilistId,
              })
            }
          } catch (err) {
            logger.warn(
              { err, provider: providerKey, showId },
              '[Video] AniList metadata lookup failed while resolving numeric showId'
            )
          }
        }

        if (targetTitle) {
          let romaji = anilistShow?.names?.romaji
          if (!romaji) {
            try {
              const show = await getShowMetaById(showId)
              romaji = show?.names?.romaji
            } catch {
              // A title from local metadata is still enough to attempt provider resolution.
            }
          }
          const resolved = await this.providers[providerKey]?.resolveShowId?.(targetTitle, romaji)
          if (resolved) {
            showId = resolved
          } else {
            logger.warn(
              { provider: providerKey, showId, title: targetTitle, romaji },
              '[Video] resolveShowId failed, attempting fallback provider search'
            )
            try {
              const fallbackResults = await this.providers[providerKey]?.search?.({
                query: targetTitle,
              })
              const fallbackId = fallbackResults?.[0]?.id
              if (fallbackId) {
                showId = fallbackId
              } else {
                logger.warn(
                  { provider: providerKey, showId, title: targetTitle },
                  '[Video] fallback provider search returned no results'
                )
                return res.json([])
              }
            } catch (fallbackErr) {
              logger.error(
                { err: fallbackErr, provider: providerKey, showId, title: targetTitle },
                '[Video] fallback provider search failed'
              )
              return res.json([])
            }
          }
        } else {
          logger.warn(
            { provider: providerKey, showId },
            '[Video] numeric showId passed to provider but local meta missing title'
          )
          return res.json([])
        }
      }

      const urls = await this.getProvider(req).getStreamUrls(
        showId,
        req.query.episodeNumber as string,
        req.query.mode as 'sub' | 'dub'
      )
      res.json(urls || [])
    } catch (e) {
      if ((e as Error).message === 'AUTH_REQUIRED') {
        return res.status(403).json({ error: 'AUTH_REQUIRED', provider: 'animepahe' })
      }
      logger.error({ err: e, provider: req.query.provider }, 'Provider video fetch failed')
      res.json([])
    }
  }

  getEpisodes = async (req: Request, res: Response) => {
    const showIdRaw = req.query.showId as string

    if (!showIdRaw) {
      return res.json({ episodes: [] })
    }

    const showId = await getMigratedId(req.db, showIdRaw, this.providers)

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(showId)) {
      try {
        if (this.providers['animepahe']) {
          const data = await this.providers['animepahe'].getEpisodes(
            showId,
            req.query.mode as 'sub' | 'dub'
          )
          return res.json(data || { episodes: [] })
        }
      } catch {
        return res.json({ episodes: [] })
      }
    }

    const isNumeric = /^\d+$/.test(showId)

    if (isNumeric) {
      try {
        const episodes = await getAnilistEpisodes(showId)
        res.set('Cache-Control', 'public, max-age=3600').json({ episodes })
      } catch (e) {
        logger.error({ err: e, showId }, 'AniList episodes fetch failed')
        res.json({ episodes: [] })
      }
      return
    }

    const providerName = (req.query.provider as string) || 'allanime'
    const provider = this.providers[providerName.toLowerCase()]
    if (provider && providerName.toLowerCase() !== 'allanime') {
      try {
        const data = await provider.getEpisodes(showId, req.query.mode as 'sub' | 'dub')
        if (data?.episodes?.length) {
          return res.json(data)
        }
      } catch {
        // ignore
      }
    }

    try {
      if (this.providers['allanime']) {
        const data = await this.providers['allanime'].getEpisodes(
          showId,
          req.query.mode as 'sub' | 'dub'
        )
        if (data?.episodes?.length) {
          return res.json(data)
        }
      }
    } catch {
      // ignore
    }

    res.json({ episodes: [] })
  }

  search = async (req: Request, res: Response) => {
    try {
      const providerName = (req.query.provider as string) || 'anilist'
      if (providerName.toLowerCase() !== 'animepahe') {
        const query = (req.query.query as string) || ''
        const page = parseInt(req.query.page as string) || 1
        const perPage = parseInt(req.query.limit as string) || 14
        const sort = (req.query.sortBy as string) || undefined

        const result = await searchAnilist({
          query,
          page,
          perPage,
          format: req.query.type as string,
          status: req.query.status as string,
          season: req.query.season as string,
          seasonYear: req.query.year ? parseInt(req.query.year as string) : undefined,
          countryOfOrigin: req.query.country as string,
          genre: req.query.genres as string,
          genre_not_in: req.query.excludeGenres
            ? (req.query.excludeGenres as string).split(',')
            : undefined,
          tag_not_in: req.query.excludeTags
            ? (req.query.excludeTags as string).split(',')
            : undefined,
          averageScore_greater: req.query.minScore
            ? parseInt(req.query.minScore as string)
            : undefined,
          episodes_greater: req.query.minEpisodes
            ? parseInt(req.query.minEpisodes as string)
            : undefined,
          isAdult:
            req.query.adult === 'true' ? true : req.query.adult === 'false' ? false : undefined,
          sort,
        })
        return res.json(result)
      }

      const data = await this.getProvider(req).search(req.query)
      res.json(data)
    } catch (e) {
      if ((e as Error).message === 'AUTH_REQUIRED') {
        return res.status(403).json({ error: 'AUTH_REQUIRED', provider: 'animepahe' })
      }
      throw e
    }
  }

  getSeasonal = async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1
    const size = parseInt(req.query.size as string) || 14
    const format = req.query.format as string | undefined
    try {
      const data = await getSeasonal(page, size, format)
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (e) {
      logger.error({ err: e }, 'Seasonal fetch failed')
      res.json([])
    }
  }

  getLatestReleases = async (req: Request, res: Response) => {
    const format = (req.query.format as string) || 'TV'
    const page = parseInt(req.query.page as string) || 1
    const size = parseInt(req.query.size as string) || 12
    try {
      const data = await getLatestReleases(format, page, size)
      res.set('Cache-Control', 'public, max-age=300').json(data)
    } catch (e) {
      logger.error({ err: e }, 'Latest releases fetch failed')
      res.json([])
    }
  }

  getShowMeta = async (req: Request, res: Response) => {
    const showIdRaw = req.params.id as string
    const id = await getMigratedId(req.db, showIdRaw, this.providers)
    const isNumeric = /^\d+$/.test(id)

    if (isNumeric) {
      try {
        const meta = await getShowMetaById(id)
        if (meta) {
          ShowsMetaRepository.upsert(req.db, {
            id: meta.id || id,
            name: meta.name,
            thumbnail: meta.thumbnail,
            nativeName: meta.nativeName,
            englishName: meta.englishName,
            genres: meta.genres ? JSON.stringify(meta.genres.map((g) => g.name)) : undefined,
            status: meta.status,
            episodeCount: meta.episodeCount != null ? Number(meta.episodeCount) : undefined,
            type: meta.type,
            anilistId: meta.anilistId,
          })
        }
        res.set('Cache-Control', 'public, max-age=3600').json(meta || {})
      } catch (e) {
        logger.error({ err: e, id }, 'AniList show-meta fetch failed')
        res.json({})
      }
      return
    }

    res.json({})
  }

  getGenresAndTags = (_req: Request, res: Response) => {
    res.json({ genres, tags, studios })
  }
}
