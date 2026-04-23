import React from 'react'
import styles from './AnimeCardSkeleton.module.css'

interface AnimeCardSkeletonProps {
  layout?: 'vertical' | 'horizontal'
}

const AnimeCardSkeleton: React.FC<AnimeCardSkeletonProps> = ({ layout = 'vertical' }) => {
  return (
    <div className={`${styles.skeletonCard} ${styles[layout]}`}>
      <div className={styles.poster}></div>
      <div className={styles.info}>
        <div className={styles.line}></div>
        <div className={`${styles.line} ${styles.short}`}></div>
      </div>
    </div>
  )
}

export default AnimeCardSkeleton
