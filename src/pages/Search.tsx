import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import AnimeCard from '../components/anime/AnimeCard';
import AnimeCardSkeleton from '../components/anime/AnimeCardSkeleton';
import ErrorMessage from '../components/common/ErrorMessage';

interface Anime {
    _id: string;
    id: string;
    name: string;
    thumbnail: string;
}

const SkeletonGrid = () => (
    <div className="grid-container">
        {Array.from({ length: 12 }).map((_, i) => <AnimeCardSkeleton key={i} />)}
    </div>
);

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

    const performSearch = async (isNewSearch: boolean) => {
        if (isLoading && !isNewSearch) return;

        setIsLoading(true);
        setError(null);

        let currentPage = page.current;
        if (isNewSearch) {
            currentPage = 1;
            hasMore.current = true;
        }

        const params = new URLSearchParams({
            query: query,
            type: Array.isArray(type) ? type.join(',') : type,
            season: season,
            year: year,
            country: country,
            translation: translation,
            page: currentPage.toString(),
        });

        try {
            const response = await fetch(`/api/search?${params}`);
            if (!response.ok) throw new Error('Search failed');
            const newFetchedResults: Anime[] = await response.json();

            if (isNewSearch) {
                const uniqueNewResults = Array.from(new Map(newFetchedResults.map((item: Anime) => [item._id, item])).values());
                setResults(uniqueNewResults);
            } else {
                setResults(prev => {
                    const existingIds = new Set(prev.map(anime => anime._id));
                    const uniqueNewResults = newFetchedResults.filter((anime: Anime) => !existingIds.has(anime._id));
                    const finalUniqueResults = Array.from(new Map(uniqueNewResults.map((item: Anime) => [item._id, item])).values()); // Ensure uniqueness within new batch
                    return [...prev, ...finalUniqueResults];
                });
            }

            if (newFetchedResults.length === 0) {
                hasMore.current = false;
            } else {
                page.current = currentPage + 1;
            }
        } catch (err: any) {
            setError(err.message);
            console.error('Search error:', err);
            if (isNewSearch) {
                setResults([]);
            }
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const handleScroll = () => {
            if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000 && !isLoading && hasMore.current) {
                performSearch(false);
            }
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [isLoading]);

    const handleSearch = () => {
        setSearchParams({ query, type, season, year, country, translation });
        performSearch(true);
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
                <button onClick={handleSearch} className="btn-primary">Search</button>
            </div>

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