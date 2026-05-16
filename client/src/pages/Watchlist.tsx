import React, { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FaChevronDown, FaChevronUp, FaFilter, FaSearch, FaTrash } from 'react-icons/fa'

import AnimeCard from '../components/anime/AnimeCard'
import SkeletonGrid from '../components/common/SkeletonGrid'
import ErrorMessage from '../components/common/ErrorMessage'
import RemoveConfirmationModal from '../components/common/RemoveConfirmationModal'
import { Button } from '../components/common/Button'
import SearchableSelect from '../components/common/SearchableSelect'

import {
  useInfiniteWatchlist,
  useRemoveFromWatchlist,
  useAllContinueWatching,
  useGenresAndStudios,
} from '../hooks/useAnimeData'
import { useSetting, useUpdateSetting } from '../hooks/useSettings'
import { useLowEndMode } from '../contexts/LowEndModeContext'
import { useTitlePreference } from '../contexts/TitlePreferenceContext'
import styles from './Watchlist.module.css'

const FILTERS = [
  'All',
  'Continue Watching',
  'Watching',
  'Completed',
  'On-Hold',
  'Dropped',
  'Planned',
]

const STATUS_OPTIONS = FILTERS.slice(2)

interface Option {
  value: string
  label: string
}

const typeOptions: Option[] = [
  { value: 'ALL', label: 'All Types' },
  { value: 'TV', label: 'TV Series' },
  { value: 'Movie', label: 'Movie' },
  { value: 'OVA', label: 'OVA' },
  { value: 'ONA', label: 'ONA' },
]

const seasonOptions: Option[] = [
  { value: 'ALL', label: 'All Seasons' },
  { value: 'Winter', label: 'Winter' },
  { value: 'Spring', label: 'Spring' },
  { value: 'Summer', label: 'Summer' },
  { value: 'Fall', label: 'Fall' },
]

const countryOptions: Option[] = [
  { value: 'ALL', label: 'All Countries' },
  { value: 'JP', label: 'Japan' },
  { value: 'CN', label: 'China' },
]

const languageOptions: Option[] = [
  { value: 'ALL', label: 'All Languages' },
  { value: 'sub', label: 'Subbed' },
  { value: 'dub', label: 'Dubbed' },
]

const getGenreStateFromParams = (params: URLSearchParams) => {
  const states: { [key: string]: 'include' | 'exclude' } = {}
  params
    .get('genres')
    ?.split(',')
    .filter(Boolean)
    .forEach((genre) => {
      states[genre] = 'include'
    })
  params
    .get('excludeGenres')
    ?.split(',')
    .filter(Boolean)
    .forEach((genre) => {
      states[genre] = 'exclude'
    })
  return states
}

const Watchlist: React.FC = () => {
  const { filter: filterBy = 'All' } = useParams<{ filter: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'last_added')
  const [query, setQuery] = useState(searchParams.get('query') || '')
  const [type, setType] = useState(searchParams.get('type') || 'ALL')
  const [season, setSeason] = useState(searchParams.get('season') || 'ALL')
  const [year, setYear] = useState(searchParams.get('year') || 'ALL')
  const [country, setCountry] = useState(searchParams.get('country') || 'ALL')
  const [language, setLanguage] = useState(searchParams.get('translation') || 'ALL')
  const [studio, setStudio] = useState(searchParams.get('studios') || 'ALL')
  const [tag, setTag] = useState(searchParams.get('tags') || 'ALL')
  const [genreStates, setGenreStates] = useState<{ [key: string]: 'include' | 'exclude' }>(() =>
    getGenreStateFromParams(searchParams)
  )
  const [showFilters, setShowFilters] = useState(() => {
    return ['type', 'season', 'year', 'country', 'translation', 'studios', 'tags', 'genres'].some(
      (key) => searchParams.has(key)
    )
  })
  const { lowEndMode } = useLowEndMode()
  const { titlePreference } = useTitlePreference()
  const { data: metaData } = useGenresAndStudios()
  const availableGenres = metaData?.genres || []
  const availableStudios = metaData?.studios || []
  const availableTags = metaData?.tags || []

  const [itemToRemove, setItemToRemove] = useState<{ id: string; name: string } | null>(null)

  const isCW = filterBy === 'Continue Watching'
  const watchlistQueryString = useMemo(() => {
    const params = new URLSearchParams(searchParams)
    params.set('titlePreference', titlePreference)
    return params.toString()
  }, [searchParams, titlePreference])

  const {
    data: cwData,
    isLoading: loadingCW,
    error: errorCW,
    fetchNextPage: fetchNextCW,
    hasNextPage: hasNextCW,
    isFetchingNextPage: isFetchingNextCW,
  } = useAllContinueWatching(watchlistQueryString)

  const {
    data: wlData,
    isLoading: loadingWL,
    error: errorWL,
    fetchNextPage: fetchNextWL,
    hasNextPage: hasNextWL,
    isFetchingNextPage: isFetchingNextWL,
  } = useInfiniteWatchlist(filterBy, watchlistQueryString)

  const list = useMemo(() => {
    return isCW ? cwData?.pages || [] : wlData?.pages || []
  }, [isCW, cwData, wlData])

  const isLoading = isCW ? loadingCW : loadingWL
  const error = isCW ? errorCW : errorWL

  const fetchNextPage = isCW ? fetchNextCW : fetchNextWL
  const hasNextPage = isCW ? hasNextCW : hasNextWL
  const isFetchingNextPage = isCW ? isFetchingNextCW : isFetchingNextWL

  useEffect(() => {
    setQuery(searchParams.get('query') || '')
    setSortBy(searchParams.get('sortBy') || 'last_added')
    setType(searchParams.get('type') || 'ALL')
    setSeason(searchParams.get('season') || 'ALL')
    setYear(searchParams.get('year') || 'ALL')
    setCountry(searchParams.get('country') || 'ALL')
    setLanguage(searchParams.get('translation') || 'ALL')
    setStudio(searchParams.get('studios') || 'ALL')
    setTag(searchParams.get('tags') || 'ALL')
    setGenreStates(getGenreStateFromParams(searchParams))
  }, [searchParams])

  useEffect(() => {
    let ticking = false
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (
            window.innerHeight + window.scrollY >= document.body.offsetHeight - 800 &&
            hasNextPage &&
            !isFetchingNextPage
          ) {
            fetchNextPage()
          }
          ticking = false
        })
        ticking = true
      }
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await fetch('/api/watchlist/status', {
        method: 'POST',
        body: JSON.stringify({ id, status }),
        headers: { 'Content-Type': 'application/json' },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] })
      toast.success('Status updated')
    },
  })

  const removeCw = useMutation({
    mutationFn: async (showId: string) => {
      await fetch('/api/continue-watching/remove', {
        method: 'POST',
        body: JSON.stringify({ showId }),
        headers: { 'Content-Type': 'application/json' },
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allContinueWatching'] }),
  })

  const removeWl = useRemoveFromWatchlist()
  const { data: skipConfirm } = useSetting('skipRemoveConfirmation')
  const updateSetting = useUpdateSetting()

  const sortedList = useMemo(() => {
    const getSortTitle = (item: (typeof list)[number]) =>
      (item[titlePreference as keyof typeof item] as string) || item.name || ''

    return [...list].sort((a, b) => {
      if (sortBy === 'name_asc') return getSortTitle(a).localeCompare(getSortTitle(b))
      if (sortBy === 'name_desc') return getSortTitle(b).localeCompare(getSortTitle(a))
      return 0
    })
  }, [list, sortBy, titlePreference])

  const currentYear = new Date().getFullYear()
  const yearOptions: Option[] = [
    { value: 'ALL', label: 'All Years' },
    ...Array.from({ length: currentYear - 1980 + 1 }, (_, i) => ({
      value: String(currentYear - i),
      label: String(currentYear - i),
    })),
  ]

  const studioOptions: Option[] = [
    { value: 'ALL', label: 'All Studios' },
    ...availableStudios.map((s) => ({ value: s, label: s })),
  ]

  const tagOptions: Option[] = [
    { value: 'ALL', label: 'All Tags' },
    ...availableTags.map((t) => ({ value: t, label: t })),
  ]

  const applyFilters = (nextSortBy = sortBy) => {
    const params = new URLSearchParams()
    if (query.trim()) params.set('query', query.trim())
    if (nextSortBy !== 'last_added') params.set('sortBy', nextSortBy)
    if (type !== 'ALL') params.set('type', type)
    if (season !== 'ALL') params.set('season', season)
    if (year !== 'ALL') params.set('year', year)
    if (country !== 'ALL') params.set('country', country)
    if (language !== 'ALL') params.set('translation', language)
    if (studio !== 'ALL') params.set('studios', studio)
    if (tag !== 'ALL') params.set('tags', tag)

    const genres = Object.entries(genreStates)
      .filter(([, state]) => state === 'include')
      .map(([genre]) => genre)
    const excludeGenres = Object.entries(genreStates)
      .filter(([, state]) => state === 'exclude')
      .map(([genre]) => genre)

    if (genres.length > 0) params.set('genres', genres.join(','))
    if (excludeGenres.length > 0) params.set('excludeGenres', excludeGenres.join(','))

    setSearchParams(params)
  }

  const resetFilters = () => {
    setQuery('')
    setSortBy('last_added')
    setType('ALL')
    setSeason('ALL')
    setYear('ALL')
    setCountry('ALL')
    setLanguage('ALL')
    setStudio('ALL')
    setTag('ALL')
    setGenreStates({})
    setSearchParams(new URLSearchParams())
  }

  const toggleGenre = (genre: string) => {
    setGenreStates((prev) => {
      const current = prev[genre]
      const next = current === 'include' ? 'exclude' : current === 'exclude' ? undefined : 'include'
      const newState = { ...prev }
      if (next) newState[genre] = next
      else delete newState[genre]
      return newState
    })
  }

  const handleRemove = (id: string, name: string) => {
    if (isCW) {
      setItemToRemove({ id, name })
      return
    }

    const shouldSkip = String(skipConfirm) === 'true' || String(skipConfirm) === '1'
    if (shouldSkip) {
      removeWl.mutate(id)
    } else {
      setItemToRemove({ id, name })
    }
  }

  const confirmRemove = (opts: { removeFromWatchlist?: boolean; rememberPreference?: boolean }) => {
    if (!itemToRemove) return
    if (isCW) {
      removeCw.mutate(itemToRemove.id)
      if (opts.removeFromWatchlist) {
        removeWl.mutate(itemToRemove.id)
      }
    } else {
      removeWl.mutate(itemToRemove.id)
    }
    if (opts.rememberPreference)
      updateSetting.mutate({ key: 'skipRemoveConfirmation', value: true })
    setItemToRemove(null)
  }

  const handleStatusChange = (id: string, status: string) => {
    updateStatus.mutate({ id, status })
  }

  return (
    <div className="page-container">
      <header className={styles.header}>
        <h2 className={styles.title}>My Watchlist</h2>
        <p className={styles.subtitle}>Track and manage your anime collection</p>
      </header>

      <div className={styles.controls}>
        <div className={styles.filters}>
          {FILTERS.map((f) => (
            <button
              key={f}
              className={`${styles.filterBtn} ${filterBy === f ? styles.active : ''}`}
              onClick={() =>
                navigate({
                  pathname: `/watchlist/${f}`,
                  search: searchParams.toString(),
                })
              }
            >
              {f}
            </button>
          ))}
        </div>
        <div>
          <select
            className={styles.sortSelect}
            value={sortBy}
            onChange={(e) => {
              const nextSortBy = e.currentTarget.value
              setSortBy(nextSortBy)
              applyFilters(nextSortBy)
            }}
          >
            <option value="last_added">Recently Added</option>
            <option value="name_asc">Name (A-Z)</option>
            <option value="name_desc">Name (Z-A)</option>
          </select>
        </div>
      </div>

      <div className={styles.filterContainer}>
        <div className={styles.searchBarWrapper}>
          <div className={styles.inputIconWrapper}>
            <FaSearch className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Search your watchlist by title..."
              value={query}
              onInput={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            />
          </div>
          <div className={styles.searchActions}>
            <Button onClick={() => applyFilters()} className={styles.searchBtn}>
              Search
            </Button>
            <button
              className={`${styles.filterToggleBtn} ${showFilters ? styles.active : ''}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <FaFilter size={14} />
              <span>Filters</span>
              {showFilters ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
            </button>
          </div>
        </div>

        <div className={`${styles.advancedFilters} ${showFilters ? styles.show : ''}`}>
          <div className={styles.filterDivider} />

          <div className={styles.filterGrid}>
            <div className={styles.filterItem}>
              <label>Type</label>
              <select value={type} onChange={(e) => setType(e.currentTarget.value)}>
                {typeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>Season</label>
              <select value={season} onChange={(e) => setSeason(e.currentTarget.value)}>
                {seasonOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>Year</label>
              <select value={year} onChange={(e) => setYear(e.currentTarget.value)}>
                {yearOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>Country</label>
              <select value={country} onChange={(e) => setCountry(e.currentTarget.value)}>
                {countryOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>Language</label>
              <select value={language} onChange={(e) => setLanguage(e.currentTarget.value)}>
                {languageOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {studioOptions.length > 1 && (
              <div className={styles.filterItem}>
                <label>Studio</label>
                <SearchableSelect
                  options={studioOptions}
                  value={studio}
                  onChange={setStudio}
                  placeholder="All Studios"
                />
              </div>
            )}
            {tagOptions.length > 1 && (
              <div className={styles.filterItem}>
                <label>Tag</label>
                <SearchableSelect
                  options={tagOptions}
                  value={tag}
                  onChange={setTag}
                  placeholder="All Tags"
                />
              </div>
            )}
          </div>

          {availableGenres.length > 0 && (
            <div className={styles.genreSection}>
              <label className={styles.genreLabel}>Genres</label>
              <div className={styles.genreContainer}>
                {availableGenres.map((genre) => (
                  <button
                    key={genre}
                    className={`${styles.genreButton} ${styles[genreStates[genre] || '']}`}
                    onClick={() => toggleGenre(genre)}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.filterActions}>
            <Button variant="secondary" onClick={resetFilters}>
              Reset All
            </Button>
            <Button onClick={() => applyFilters()} className={styles.applyBtn}>
              Apply Filters
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <SkeletonGrid />
      ) : error ? (
        <ErrorMessage message={error.message} />
      ) : (
        <>
          <div className={`${styles.grid} ${lowEndMode ? styles.lowEnd : ''}`}>
            {sortedList.map((item) => (
              <div key={item._id} className={styles.itemWrapper}>
                <AnimeCard
                  anime={item}
                  continueWatching={isCW}
                  onRemove={() => handleRemove(item.id, item.name)}
                  layout="horizontal"
                />
                {!isCW && (
                  <div className={styles.cardActions}>
                    <select
                      className={styles.statusSelect}
                      value={item.status}
                      onChange={(e) =>
                        updateStatus.mutate({ id: item.id, status: e.currentTarget.value })
                      }
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      className={styles.removeBtn}
                      onClick={() => handleRemove(item.id, item.name)}
                      title="Remove from Watchlist"
                    >
                      <FaTrash size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {isFetchingNextPage && <SkeletonGrid count={6} />}
        </>
      )}

      {!isLoading && sortedList.length === 0 && (
        <div className={styles.emptyState}>
          <p>No anime found in this list.</p>
        </div>
      )}

      <RemoveConfirmationModal
        isOpen={!!itemToRemove}
        onClose={() => setItemToRemove(null)}
        onConfirm={confirmRemove}
        animeName={itemToRemove?.name || ''}
        scenario={isCW ? 'continueWatching' : 'watchlist'}
      />
    </div>
  )
}

export default Watchlist
