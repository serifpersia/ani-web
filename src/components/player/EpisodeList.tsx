import React, { useState, useMemo } from 'react';
import styles from './EpisodeList.module.css';

interface EpisodeListProps {
    episodes: string[];
    currentEpisode?: string;
    watchedEpisodes: string[];
    onEpisodeClick: (ep: string) => void;
}

const EpisodeList: React.FC<EpisodeListProps> = ({ episodes, currentEpisode, watchedEpisodes, onEpisodeClick }) => {
    const [selectedRange, setSelectedRange] = useState(0);

    const episodeRanges = useMemo(() => {
        if (episodes.length <= 100) return [];
        const ranges = [];
        for (let i = 0; i < episodes.length; i += 100) {
            const start = i + 1;
            const end = Math.min(i + 100, episodes.length);
            ranges.push(`${start}-${end}`);
        }
        return ranges;
    }, [episodes]);

    const filteredEpisodes = useMemo(() => {
        if (episodeRanges.length === 0) return episodes;
        const range = episodeRanges[selectedRange];
        const [startStr, endStr] = range.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        return episodes.slice(start - 1, end);
    }, [episodes, episodeRanges, selectedRange]);

    return (
        <>
            <h3 className={styles.episodeListTitle}>Episodes</h3>
            {episodeRanges.length > 0 && (
                <div className={styles.rangeSelector}>
                    {episodeRanges.map((range, index) => (
                        <button
                            key={range}
                            className={`${styles.rangeButton} ${selectedRange === index ? styles.active : ''}`}
                            onClick={() => setSelectedRange(index)}
                        >
                            {range}
                        </button>
                    ))}
                </div>
            )}
            <ul className={styles.episodeList}>
                {filteredEpisodes.map(ep => (
                    <li
                        key={ep}
                        className={`${styles.episodeItem} ${watchedEpisodes.includes(ep) ? styles.watched : ''} ${ep === currentEpisode ? styles.active : ''}`}
                        onClick={() => onEpisodeClick(ep)}
                    >
                        <span className={styles.epNumber}>{ep}</span>
                        <span className={styles.epTitle}>Episode {ep}</span>
                    </li>
                ))}
            </ul>
        </>
    );
};

export default EpisodeList;