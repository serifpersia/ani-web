import React from 'react';
import styles from '../../pages/Player.module.css';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa';
import type { DetailedShowMeta, AllMangaDetail } from '../../pages/Player';

interface ShowDetailsProps {
    showMeta: Partial<DetailedShowMeta>;
    allMangaDetails: AllMangaDetail | null;
    loading: boolean;
    error: string | null;
    isOpen: boolean;
    onToggle: () => void;
}

const ShowDetails: React.FC<ShowDetailsProps> = ({ showMeta, allMangaDetails, loading, error, isOpen, onToggle }) => {
    const websiteOrder = ['official', 'mal', 'aniList', 'kitsu', 'animePlanet', 'anidb'];

    return (
        <div className={styles.detailsBox}>
            <button className={styles.detailsToggle} onClick={onToggle}>
                <h3>Details</h3>
                {isOpen ? <FaChevronUp /> : <FaChevronDown />}
            </button>
            {isOpen && (
                <>
                    {loading ? (
                        <p className={styles.loadingDetails}>Loading details...</p>
                    ) : error ? (
                        <p className="error-message">{error}</p>
                    ) : (
                        <>
                            <div className={styles.detailsGridContainer}>
                                <div className={styles.detailItem}><strong>Type:</strong> {showMeta.mediaTypes?.[0]?.name}</div>
                                <div className={styles.detailItem}><strong>Status:</strong> {showMeta.status}</div>
                                <div className={styles.detailItem}><strong>Score:</strong> {showMeta.stats ? (showMeta.stats.averageScore / 10).toFixed(1) : 'N/A'}</div>
                                <div className={styles.detailItem}><strong>Studios:</strong> {showMeta.studios?.map((s: { name: string }) => s.name).join(', ')}</div>
                                <div className={styles.detailItem}><strong>Source:</strong> {showMeta.sources?.[0]?.name}</div>
                                <div className={styles.detailItem}><strong>Episode Length:</strong> {showMeta.lengthMin} min</div>
                                <div className={styles.detailItem}><strong>English Title:</strong> {showMeta.names?.english}</div>
                                <div className={styles.detailItem}><strong>Native Title:</strong> {showMeta.names?.native}</div>
                                {showMeta.genres && showMeta.genres.length > 0 && (
                                    <div className={`${styles.detailItem} ${styles.genresContainer}`}>
                                        <strong>Genres:</strong>
                                        <div className={styles.genresList}>
                                            {showMeta.genres.map((genre: { route: string; name: string }) => <span key={genre.route} className={styles.genreTag}>{genre.name}</span>)}
                                        </div>
                                    </div>
                                )}
                                {allMangaDetails && (
                                    <>
                                        <div className={styles.detailItem}><strong>Rating:</strong> {allMangaDetails.Rating}</div>
                                        <div className={styles.detailItem}><strong>Season:</strong> {allMangaDetails.Season}</div>
                                        <div className={styles.detailItem}><strong>Episodes:</strong> {allMangaDetails.Episodes}</div>
                                        <div className={styles.detailItem}><strong>Date:</strong> {allMangaDetails.Date}</div>
                                        <div className={styles.detailItem}><strong>Original Broadcast:</strong> {allMangaDetails["Original Broadcast"]}</div>
                                    </>
                                )}
                            </div>
                            {showMeta.websites && (
                                <div className={styles.websitesContainer}>
                                    <strong>External Links:</strong>
                                    <div className={styles.websitesList}>
                                        {websiteOrder.map(key => {
                                            const url = showMeta.websites[key as keyof typeof showMeta.websites];
                                            if (url && typeof url === 'string') {
                                                return <a key={key} href={`https://${url}`} target="_blank" rel="noopener noreferrer" className={styles.websiteLink}>{key.charAt(0).toUpperCase() + key.slice(1).replace('aniList', 'AniList').replace('animePlanet', 'Anime-Planet')}</a>;
                                            }
                                            return null;
                                        })}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
};

export default ShowDetails;