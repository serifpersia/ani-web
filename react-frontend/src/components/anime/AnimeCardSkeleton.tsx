
import React from 'react';
import styles from './AnimeCardSkeleton.module.css';

const AnimeCardSkeleton: React.FC = () => {
  return (
    <div className={styles.skeletonCard}>
      <div className={styles.poster}></div>
      <div className={styles.info}>
        <div className={styles.line}></div>
        <div className={`${styles.line} ${styles.short}`}></div>
      </div>
    </div>
  );
};

export default AnimeCardSkeleton;
