import type { DetailedShowMeta } from '../types/player'

type MetaDate = {
  year?: number | string | null
  month?: number | string | null
  date?: number | string | null
} | null

export interface AnimeMetaDetail {
  label: string
  value: string
}

const COUNTRY_NAMES: Record<string, string> = {
  JP: 'Japan',
  KR: 'Korea',
  CN: 'China',
  CH: 'China',
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const hasFullDate = (date: MetaDate): boolean =>
  toNumber(date?.year) !== null && toNumber(date?.month) !== null && toNumber(date?.date) !== null

export const formatAnimeDate = (date: MetaDate): string | null => {
  const year = toNumber(date?.year)
  if (year === null) return null

  const month = toNumber(date?.month)
  const day = toNumber(date?.date)

  if (month !== null && day !== null) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month, day)))
  }

  if (month !== null) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month, 1)))
  }

  return String(year)
}

export const formatAiredRange = (
  startDate: MetaDate,
  endDate: MetaDate,
  status?: string | null
): string | null => {
  const start = formatAnimeDate(startDate)
  const end = hasFullDate(endDate) ? formatAnimeDate(endDate) : null

  if (start && end) return `${start} - ${end}`
  if (start && status?.toLowerCase() === 'releasing') return `${start} - TBA`
  return start || end
}

export const formatEpisodeCount = (showMeta: Partial<DetailedShowMeta>): string | null => {
  const detailCounts = [
    showMeta.availableEpisodesDetail?.sub?.length,
    showMeta.availableEpisodesDetail?.dub?.length,
    showMeta.availableEpisodesDetail?.raw?.length,
  ].filter((count): count is number => typeof count === 'number')

  const numericCounts = [
    showMeta.availableEpisodes?.sub,
    showMeta.availableEpisodes?.dub,
    showMeta.availableEpisodes?.raw,
  ]
    .map(toNumber)
    .filter((count): count is number => count !== null)

  const available = Math.max(0, ...detailCounts, ...numericCounts)
  const total = toNumber(showMeta.episodeCount)

  if (available > 0 && total !== null) return `${available}/${total}`
  if (available > 0) return String(available)
  if (total !== null) return String(total)
  return null
}

export const formatScore = (showMeta: Partial<DetailedShowMeta>): string | null => {
  const score = toNumber(showMeta.score)
  if (score !== null) return String(score)

  const averageScore = toNumber(showMeta.averageScore ?? showMeta.stats?.averageScore)
  if (averageScore !== null) return (averageScore / 10).toFixed(1)

  return null
}

export const formatCountry = (country?: string | null): string | null => {
  if (!country) return null
  return COUNTRY_NAMES[country] || country
}

export const formatSeason = (season: Partial<DetailedShowMeta>['season']): string | null => {
  if (!season) return null
  return (
    [season.quarter || season.season || season.title, season.year].filter(Boolean).join(' ') || null
  )
}

export const formatStudios = (studios: Partial<DetailedShowMeta>['studios']): string | null => {
  if (!studios?.length) return null
  return studios
    .map((studio) => (typeof studio === 'string' ? studio : studio.name))
    .filter(Boolean)
    .join(', ')
}

export const getAnimeMetaDetails = (
  showMeta: Partial<DetailedShowMeta> | undefined
): AnimeMetaDetail[] => {
  if (!showMeta) return []

  const rows: Array<[string, string | null | undefined]> = [
    ['Status', showMeta.status],
    ['Score', formatScore(showMeta)],
    ['Type', showMeta.type],
    ['Country', formatCountry(showMeta.country)],
    ['Season', formatSeason(showMeta.season)],
    ['Rating', showMeta.rating],
    ['Studios', formatStudios(showMeta.studios)],
    ['Aired', formatAiredRange(showMeta.airedStart, showMeta.airedEnd, showMeta.status)],
    ['Episodes', formatEpisodeCount(showMeta)],
  ]

  return rows
    .filter((row): row is [string, string] => typeof row[1] === 'string' && row[1].trim() !== '')
    .map(([label, value]) => ({ label, value }))
}
