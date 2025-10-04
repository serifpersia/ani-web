import React from 'react';
import styles from '../../pages/Player.module.css';

interface EpisodeListProps {
    episodes: string[];
    currentEpisode?: string;
    watchedEpisodes: string[];
    currentMode: 'sub' | 'dub';
    onEpisodeClick: (ep: string) => void;
}

const EpisodeList: React.FC<EpisodeListProps> = ({ episodes, currentEpisode, watchedEpisodes, currentMode, onEpisodeClick }) => {
    return (
        <div className={styles.episodeListContainer}>
            <h3>Episodes ({currentMode.toUpperCase()})</h3>
            <div className={styles.episodeList}>
                {episodes.map(ep => (
                    <button
                        key={ep}
                        data-episode={ep}
                        className={`${styles.episodeItem} ${watchedEpisodes.includes(ep) ? styles.watched : ''} ${ep === currentEpisode ? styles.active : ''}`}
                        onClick={() => onEpisodeClick(ep)}
                    >
                        Ep {ep}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default EpisodeList;