import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AnimeCard from '../components/anime/AnimeCard';
import AnimeCardSkeleton from '../components/anime/AnimeCardSkeleton';
import SearchableSelect from '../components/common/SearchableSelect';
import ErrorMessage from '../components/common/ErrorMessage';
import type { Anime as _Anime } from '../hooks/useAnimeData';
import { useSearchAnime } from '../hooks/useAnimeData';

const SkeletonGrid = React.memo(() => (
    <div className="grid-container">
        {Array.from({ length: 12 }).map((_, i) => <AnimeCardSkeleton key={i} />)}
    </div>
));

const Search: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [query, setQuery] = useState(searchParams.get('query') || '');
    const [type, setType] = useState(searchParams.get('type') || 'ALL');
    const [season, setSeason] = useState(searchParams.get('season') || 'ALL');
    const [year, setYear] = useState(searchParams.get('year') || 'ALL');
    const [country, setCountry] = useState(searchParams.get('country') || 'ALL');
    const [translation, setTranslation] = useState(searchParams.get('translation') || 'sub');
    const [showGenres, setShowGenres] = useState(false);
    const [genreStates, setGenreStates] = useState<{[key: string]: 'include' | 'exclude'}>({});
    const [availableGenres, setAvailableGenres] = useState<string[]>([]);
    const [availableTags, setAvailableTags] = useState<{ value: string, isStudio: boolean }[]>([]);
    const [selectedTag, setSelectedTag] = useState<string>('ALL');

    const currentSearchQuery = new URLSearchParams(searchParams).toString();

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
        isError,
        error,
    } = useSearchAnime(currentSearchQuery);

    const searchResults = data?.pages ? data.pages.flatMap(page => page.results || []) : [];

    useEffect(() => {
        setQuery(searchParams.get('query') || '');
    }, [searchParams]);

    useEffect(() => {
        const fetchGenresAndTags = async () => {
            try {
                const response = await fetch('/api/genres-and-tags');
                if (!response.ok) throw new Error('Failed to fetch genres and tags');
                const data = await response.json();
                setAvailableGenres(data.genres || []);
                const tags = data.tags?.map((tag: string) => ({ value: tag, isStudio: false })) || [];
                const studios = data.studios?.map((studio: string) => ({ value: studio, isStudio: true })) || [];
                setAvailableTags([...tags, ...studios]);
            } catch (err) {
                console.error('Failed to fetch genres and tags:', err);
            }
        };
        fetchGenresAndTags();
    }, []);

    useEffect(() => {
        if (query) {
            document.title = `Search for "${query}" - ani-web`;
        } else {
            document.title = 'Search - ani-web';
        }
    }, [query]);

    useEffect(() => {
        const handleScroll = () => {
            if (
                window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000 &&
                !isFetchingNextPage &&
                hasNextPage
            ) {
                fetchNextPage();
            }
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [isFetchingNextPage, hasNextPage, fetchNextPage]);

    const handleSearch = () => {
        const genres = Object.entries(genreStates).filter(([, state]) => state === 'include').map(([genre]) => genre);
        const excludeGenres = Object.entries(genreStates).filter(([, state]) => state === 'exclude').map(([genre]) => genre);
        const selectedTagData = availableTags.find(t => t.value === selectedTag);
        const tags = selectedTagData && !selectedTagData.isStudio ? selectedTag : undefined;
        const studios = selectedTagData && selectedTagData.isStudio ? selectedTag : undefined;

        const newSearchParams = new URLSearchParams();
        if (query) newSearchParams.set('query', query);
        if (type !== 'ALL') newSearchParams.set('type', type);
        if (season !== 'ALL') newSearchParams.set('season', season);
        if (year !== 'ALL') newSearchParams.set('year', year);
        if (country !== 'ALL') newSearchParams.set('country', country);
        newSearchParams.set('translation', translation);
        if (genres.length > 0) newSearchParams.set('genres', genres.join(','));
        if (excludeGenres.length > 0) newSearchParams.set('excludeGenres', excludeGenres.join(','));
        if (tags) newSearchParams.set('tags', tags);
        if (studios) newSearchParams.set('studios', studios);

        setSearchParams(newSearchParams);
    };

    const handleGenreClick = (genre: string) => {
        setGenreStates(prev => {
            const newState = { ...prev };
            if (newState[genre] === 'include') {
                newState[genre] = 'exclude';
            } else if (newState[genre] === 'exclude') {
                delete newState[genre];
            } else {
                newState[genre] = 'include';
            }
            return newState;
        });
    };

    const currentYear = new Date().getFullYear();
    const years = ['ALL'];
    for (let y = currentYear; y >= 1940; y--) {
        years.push(y.toString());
    }

    return (
        <div className="page-container" style={{ padding: '1rem' }}>
            <h1>Search</h1>
            <div className="search-filters" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <input
                    type="text"
                    placeholder="Search..."
                    className="form-input"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && handleSearch()}
                />
                <select value={type} onChange={e => setType(e.target.value)} className="form-input">
                    <option value="ALL">Type: All</option>
                    <option value="TV">TV</option>
                    <option value="Movie">Movie</option>
                    <option value="OVA">OVA</option>
                    <option value="ONA">ONA</option>
                    <option value="Special">Special</option>
                </select>

                <select value={season} onChange={e => setSeason(e.target.value)} className="form-input">
                    <option value="ALL">Season: All</option>
                    <option value="Winter">Winter</option>
                    <option value="Spring">Spring</option>
                    <option value="Summer">Summer</option>
                    <option value="Fall">Fall</option>
                </select>
                <select value={year} onChange={e => setYear(e.target.value)} className="form-input">
                    {years.map(y => <option key={y} value={y}>{y === 'ALL' ? 'Year: All' : y}</option>)}
                </select>
                <select value={country} onChange={e => setCountry(e.target.value)} className="form-input">
                    <option value="ALL">Country: All</option>
                    <option value="JP">Japan</option>
                    <option value="CN">China</option>
                    <option value="KR">Korea</option>
                </select>
                <select value={translation} onChange={e => setTranslation(e.target.value)} className="form-input">
                    <option value="sub">Sub</option>
                    <option value="dub">Dub</option>
                </select>
                <SearchableSelect
                    value={selectedTag}
                    onChange={setSelectedTag}
                    options={[
                        { value: 'ALL', label: 'Tag/Studio: All' },
                        ...availableTags.map(tag => ({ value: tag.value, label: tag.isStudio ? `${tag.value} (studio)` : tag.value }))
                    ]}
                    placeholder="Tag/Studio: All"
                />
                <button onClick={() => setShowGenres(!showGenres)} className="btn-primary">Genres</button>
                <button onClick={handleSearch} className="btn-primary">Apply Filters</button>
            </div>

            {showGenres && (
                <div className="genre-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                    {availableGenres.map(genre => (
                        <div key={genre} style={{ position: 'relative' }}>
                            <button
                                onClick={() => handleGenreClick(genre)}
                                className={`genre-button ${genreStates[genre]}`}>
                                {genre}
                            </button>
                            {genreStates[genre] && (
                                <span style={{ position: 'absolute', top: '-0.5rem', right: '-0.5rem', background: 'var(--bg-secondary)', padding: '0.2rem', borderRadius: '50%', fontSize: '0.7rem' }}>
                                    {genreStates[genre] === 'include' ? '+' : '-'}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {isError && <ErrorMessage message={error?.message || 'An unknown error occurred'} />}
            
            <div className="grid-container">
                {searchResults.map(anime => <AnimeCard key={anime._id} anime={anime} />)}
                {(isLoading || isFetchingNextPage) && <SkeletonGrid />}
                {!hasNextPage && searchResults.length > 0 && <p style={{textAlign: 'center', marginTop: '1rem'}}>No more results.</p>}
            </div>
        </div>
    );
};

export default Search;
