import { useState, useEffect } from 'preact/hooks'
import { useSearchParams } from 'react-router-dom'
import AnimeCard from '../components/anime/AnimeCard'
import SkeletonGrid from '../components/common/SkeletonGrid'
import { Dropdown } from '../components/common/Dropdown'
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
  { value: 'ALL', label: 'Type: All' },
  { value: 'TV', label: 'TV' },
  { value: 'Movie', label: 'Movie' },
  { value: 'OVA', label: 'OVA' },
  { value: 'ONA', label: 'ONA' },
]

const seasonOptions: Option[] = [
  { value: 'ALL', label: 'Season: All' },
  { value: 'Winter', label: 'Winter' },
  { value: 'Spring', label: 'Spring' },
  { value: 'Summer', label: 'Summer' },
  { value: 'Fall', label: 'Fall' },
]

const countryOptions: Option[] = [
  { value: 'ALL', label: 'Country: All' },
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
    { value: 'ALL', label: 'Year: All' },
    ...Array.from({ length: currentYear - 1980 + 1 }, (_, i) => ({
      value: String(currentYear - i),
      label: String(currentYear - i),
    })),
  ]

  const studioOptions: Option[] = [
    { value: 'ALL', label: 'Studio: All' },
    ...availableStudios.map((s) => ({ value: s, label: s })),
  ]

  return (
    <div className="page-container">
      <div className="section-title">Search</div>

      <div className={styles.filterContainer}>
        <div className={styles.searchBar}>
          <input
            className={styles.searchInput}
            placeholder="Search anime..."
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button onClick={handleSearch}>Search</Button>
          <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}>
            {showFilters ? 'Hide Filters' : 'Filters'}
          </Button>
        </div>

        <div className={`${styles.advancedFilters} ${showFilters ? styles.show : ''}`}>
          <div className={styles.selectGrid}>
            <select value={type} onChange={(e) => setType(e.currentTarget.value)}>
              {typeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select value={season} onChange={(e) => setSeason(e.currentTarget.value)}>
              {seasonOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select value={year} onChange={(e) => setYear(e.currentTarget.value)}>
              {yearOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select value={country} onChange={(e) => setCountry(e.currentTarget.value)}>
              {countryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {studioOptions.length > 1 && (
              <SearchableSelect
                options={studioOptions}
                value={studio}
                onChange={setStudio}
                placeholder="Studio: All"
              />
            )}
          </div>

          {availableGenres.length > 0 && (
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
          )}

          <Button onClick={handleSearch} className={styles.applyBtn}>
            Apply Filters
          </Button>
        </div>
      </div>

      {isError && <ErrorMessage message={error?.message || 'Error'} />}

      <div className="grid-container">
        {results.map((anime) => (
          <AnimeCard key={anime._id} anime={anime} />
        ))}
        {(isLoading || isFetchingNextPage) && <SkeletonGrid />}
      </div>

      {!isLoading && results.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No results found.</p>
      )}
    </div>
  )
}
