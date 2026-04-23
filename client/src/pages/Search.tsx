import { useState, useEffect } from 'preact/hooks'
import { useSearchParams } from 'react-router-dom'
import { FaSearch, FaFilter, FaChevronDown, FaChevronUp } from 'react-icons/fa'
import AnimeCard from '../components/anime/AnimeCard'
import SkeletonGrid from '../components/common/SkeletonGrid'
import { Button } from '../components/common/Button'
import ErrorMessage from '../components/common/ErrorMessage'
import SearchableSelect from '../components/common/SearchableSelect'
import { useSearchAnime } from '../hooks/useAnimeData'
import styles from './Search.module.css'

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

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('query') || '')

  const [type, setType] = useState('ALL')
  const [season, setSeason] = useState('ALL')
  const [year, setYear] = useState('ALL')
  const [country, setCountry] = useState('ALL')
  const [studio, setStudio] = useState('ALL')
  const [showFilters, setShowFilters] = useState(false)

  const [availableGenres, setAvailableGenres] = useState<string[]>([])
  const [availableStudios, setAvailableStudios] = useState<string[]>([])
  const [genreStates, setGenreStates] = useState<{ [key: string]: 'include' | 'exclude' }>({})

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error } =
    useSearchAnime(searchParams.toString())
  const results = data?.pages.flatMap((p) => p.results) || []

  useEffect(() => {
    setQuery(searchParams.get('query') || '')
    setStudio(searchParams.get('studios') || 'ALL')
  }, [searchParams])

  useEffect(() => {
    fetch('/api/genres-and-tags')
      .then((res) => res.json())
      .then((data) => {
        setAvailableGenres(data.genres || [])
        setAvailableStudios(data.studios || [])
      })
      .catch(console.error)
  }, [])

  const handleSearch = () => {
    const params = new URLSearchParams()
    if (query.trim()) params.set('query', query.trim())

    if (type !== 'ALL') params.set('type', type)
    if (season !== 'ALL') params.set('season', season)
    if (year !== 'ALL') params.set('year', year)
    if (country !== 'ALL') params.set('country', country)
    if (studio !== 'ALL') params.set('studios', studio)

    const genres = Object.entries(genreStates)
      .filter(([, s]) => s === 'include')
      .map(([g]) => g)
    const exclude = Object.entries(genreStates)
      .filter(([, s]) => s === 'exclude')
      .map(([g]) => g)

    if (genres.length > 0) params.set('genres', genres.join(','))
    if (exclude.length > 0) params.set('excludeGenres', exclude.join(','))

    setSearchParams(params)
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

  useEffect(() => {
    const onScroll = () => {
      if (
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 500 &&
        hasNextPage &&
        !isFetchingNextPage
      ) {
        fetchNextPage()
      }
    }
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

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

  return (
    <div className="page-container">
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>Search Anime</h1>
        <p className={styles.pageSubtitle}>
          Search through thousands of titles and discover your next favorite
        </p>
      </div>

      <div className={styles.filterContainer}>
        <div className={styles.searchBarWrapper}>
          <div className={styles.inputIconWrapper}>
            <FaSearch className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Search by title, character, or studio..."
              value={query}
              onInput={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div className={styles.searchActions}>
            <Button onClick={handleSearch} className={styles.searchBtn}>
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
          </div>

          {availableGenres.length > 0 && (
            <div className={styles.genreSection}>
              <label className={styles.genreLabel}>Genres</label>
              <div className={styles.genreContainer}>
                {availableGenres.map((g) => (
                  <button
                    key={g}
                    className={`${styles.genreButton} ${styles[genreStates[g] || '']}`}
                    onClick={() => toggleGenre(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.filterActions}>
            <Button
              variant="secondary"
              onClick={() => {
                setGenreStates({})
                setType('ALL')
                setSeason('ALL')
                setYear('ALL')
                setCountry('ALL')
                setStudio('ALL')
              }}
            >
              Reset All
            </Button>
            <Button onClick={handleSearch} className={styles.applyBtn}>
              Apply Filters
            </Button>
          </div>
        </div>
      </div>

      {isError && <ErrorMessage message={error?.message || 'Error'} />}

      <div className={styles.resultsGrid}>
        {results.map((anime) => (
          <AnimeCard key={anime._id} anime={anime} />
        ))}
        {(isLoading || isFetchingNextPage) && <SkeletonGrid />}
      </div>

      {!isLoading && results.length === 0 && (
        <div className={styles.noResults}>
          <FaSearch size={48} className={styles.noResultsIcon} />
          <h3>No results found</h3>
          <p>Try adjusting your search or filters to find what you're looking for.</p>
        </div>
      )}
    </div>
  )
}
