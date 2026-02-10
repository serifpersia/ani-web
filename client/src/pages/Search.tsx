import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import AnimeCard from '../components/anime/AnimeCard'
import SkeletonGrid from '../components/common/SkeletonGrid'
import SearchableSelect from '../components/common/SearchableSelect'
import ErrorMessage from '../components/common/ErrorMessage'
import { useSearchAnime } from '../hooks/useAnimeData'
import styles from './Search.module.css'

const Search: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('query') || '')

  const [type, setType] = useState('ALL')
  const [season, setSeason] = useState('ALL')
  const [year, setYear] = useState('ALL')
  const [country, setCountry] = useState('ALL')
  const [showFilters, setShowFilters] = useState(false)

  const [availableGenres, setAvailableGenres] = useState<string[]>([])
  const [genreStates, setGenreStates] = useState<{ [key: string]: 'include' | 'exclude' }>({})

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error } =
    useSearchAnime(searchParams.toString())
  const results = data?.pages.flatMap((p) => p.results) || []

  useEffect(() => {
    setQuery(searchParams.get('query') || '')
  }, [searchParams])

  useEffect(() => {
    fetch('/api/genres-and-tags')
      .then((res) => res.json())
      .then((data) => setAvailableGenres(data.genres || []))
      .catch(console.error)
  }, [])

  const handleSearch = () => {
    const params = new URLSearchParams()
    if (query.trim()) params.set('query', query.trim())

    if (type !== 'ALL') params.set('type', type)
    if (season !== 'ALL') params.set('season', season)
    if (year !== 'ALL') params.set('year', year)
    if (country !== 'ALL') params.set('country', country)

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
  }, [hasNextPage, isFetchingNextPage])

  const years = ['ALL', ...Array.from({ length: 2025 - 1980 }, (_, i) => (2025 - i).toString())]

  return (
    <div className="page-container">
      <div className="section-title">Search</div>

      <div className={styles.filterContainer}>
        <div className={styles.searchBar}>
          <input
            className="form-input"
            style={{ flex: 1 }}
            placeholder="Search anime..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button className="btn-primary" onClick={handleSearch}>
            Search
          </button>
          <button className="btn-secondary" onClick={() => setShowFilters(!showFilters)}>
            {showFilters ? 'Hide Filters' : 'Filters'}
          </button>
        </div>

        <div className={`${styles.advancedFilters} ${showFilters ? styles.show : ''}`}>
          <div className={styles.selectGrid}>
            <select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="ALL">Type: All</option>
              <option value="TV">TV</option>
              <option value="Movie">Movie</option>
              <option value="OVA">OVA</option>
              <option value="ONA">ONA</option>
            </select>
            <select
              className="form-select"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
            >
              <option value="ALL">Season: All</option>
              <option value="Winter">Winter</option>
              <option value="Spring">Spring</option>
              <option value="Summer">Summer</option>
              <option value="Fall">Fall</option>
            </select>
            <select className="form-select" value={year} onChange={(e) => setYear(e.target.value)}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y === 'ALL' ? 'Year: All' : y}
                </option>
              ))}
            </select>
            <select
              className="form-select"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              <option value="ALL">Country: All</option>
              <option value="JP">Japan</option>
              <option value="CN">China</option>
            </select>
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

          <button
            className="btn-primary"
            style={{ alignSelf: 'flex-start' }}
            onClick={handleSearch}
          >
            Apply Filters
          </button>
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

export default Search
