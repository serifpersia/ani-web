import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import AnimeCard from '../components/anime/AnimeCard';
import AnimeCardSkeleton from '../components/anime/AnimeCardSkeleton';
import SearchableSelect from '../components/common/SearchableSelect';
import ErrorMessage from '../components/common/ErrorMessage';

interface Anime {
    _id: string;
    id: string;
    name: string;
    thumbnail: string;
    type?: string;
    availableEpisodesDetail?: {
        sub?: string[];
        dub?: string[];
    };
}

const SkeletonGrid = () => (
    <div className="grid-container">
        {Array.from({ length: 12 }).map((_, i) => <AnimeCardSkeleton key={i} />)}
    </div>
);

const fetchEpisodeDetails = async (showId: string) => {
    try {
        const [subEpisodesResponse, dubEpisodesResponse] = await Promise.all([
            fetch(`/api/episodes?showId=${showId}&mode=sub`),
            fetch(`/api/episodes?showId=${showId}&mode=dub`)
        ]);

        if (!subEpisodesResponse.ok) throw new Error("Failed to fetch sub episodes");
        if (!dubEpisodesResponse.ok) throw new Error("Failed to fetch dub episodes");

        const subEpisodeData = await subEpisodesResponse.json();
        const dubEpisodeData = await dubEpisodesResponse.json();

        return {
            availableEpisodesDetail: {
                sub: subEpisodeData.episodes,
                dub: dubEpisodeData.episodes,
            },
        };
    } catch (error) {
        console.error(`Error fetching episode details for ${showId}:`, error);
        return null;
    }
};

const performSearch = async (searchParams: URLSearchParams, page: React.MutableRefObject<number>, hasMore: React.MutableRefObject<boolean>, setIsLoading: React.Dispatch<React.SetStateAction<boolean>>, setError: React.Dispatch<React.SetStateAction<string | null>>, setResults: React.Dispatch<React.SetStateAction<Anime[]>>, isNewSearch: boolean) => {
    setIsLoading(true);
    setError(null);

    let currentPage = page.current;
    if (isNewSearch) {
        currentPage = 1;
        hasMore.current = true;
    }

    const params = new URLSearchParams(searchParams);
    params.set('page', currentPage.toString());

    try {
        const response = await fetch(`/api/search?${params}`);
        if (!response.ok) throw new Error('Search failed');
        const newFetchedResults: Anime[] = await response.json();

        const detailedResults = await Promise.all(
            newFetchedResults.map(async (anime) => {
                const episodeDetails = await fetchEpisodeDetails(anime._id);
                return { ...anime, ...episodeDetails };
            })
        );

        if (isNewSearch) {
            const uniqueNewResults = Array.from(new Map(detailedResults.map((item: Anime) => [item._id, item])).values());
            setResults(uniqueNewResults);
        } else {
            setResults(prev => {
                const existingIds = new Set(prev.map(anime => anime._id));
                const uniqueNewResults = detailedResults.filter((anime: Anime) => !existingIds.has(anime._id));
                const finalUniqueResults = Array.from(new Map(uniqueNewResults.map((item: Anime) => [item._id, item])).values()); // Ensure uniqueness within new batch
                return [...prev, ...finalUniqueResults];
            });
        }

        if (newFetchedResults.length === 0) {
            hasMore.current = false;
        } else {
            page.current = currentPage + 1;
        }
    } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error('Search error:', err);
        if (isNewSearch) {
            setResults([]);
        }
    } finally {
        setIsLoading(false);
    }
};

const Search: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [results, setResults] = useState<Anime[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const page = useRef(1);
    const hasMore = useRef(true);

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

    const stablePerformSearch = useCallback(() => {
        performSearch(searchParams, page, hasMore, setIsLoading, setError, setResults, true);
    }, [searchParams]);

    useEffect(() => {
        if (availableTags.length > 0 && searchParams.toString()) {
            stablePerformSearch();
        }
    }, [availableTags, stablePerformSearch]);

    useEffect(() => {
        const handleScroll = () => {
            if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000 && !isLoading && hasMore.current) {
                performSearch(searchParams, page, hasMore, setIsLoading, setError, setResults, false);
            }
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [isLoading, searchParams]);

    const handleSearch = () => {
        const genres = Object.entries(genreStates).filter(([, state]) => state === 'include').map(([genre]) => genre);
        const excludeGenres = Object.entries(genreStates).filter(([, state]) => state === 'exclude').map(([genre]) => genre);
        const selectedTagData = availableTags.find(t => t.value === selectedTag);
        const tags = selectedTagData && !selectedTagData.isStudio ? selectedTag : undefined;
        const studios = selectedTagData && selectedTagData.isStudio ? selectedTag : undefined;

        const newSearchParams = new URLSearchParams();
        newSearchParams.set('query', query);
        newSearchParams.set('type', type);
        newSearchParams.set('season', season);
        newSearchParams.set('year', year);
        newSearchParams.set('country', country);
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

            {error && <ErrorMessage message={error} />}
            
            <div className="grid-container">
                {results.map(anime => <AnimeCard key={anime._id} anime={anime} />)}
                {isLoading && <SkeletonGrid />}
                {!isLoading && results.length === 0 && !error && <p style={{textAlign: 'center', marginTop: '1rem'}}>No results found.</p>}
                {!hasMore.current && results.length > 0 && <p style={{textAlign: 'center', marginTop: '1rem'}}>No more results.</p>}
            </div>
        </div>
    );
};

export default Search;