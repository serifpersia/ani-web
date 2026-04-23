import React from 'react'
import AnimeCardSkeleton from '../anime/AnimeCardSkeleton'

interface SkeletonGridProps {
  count?: number
  layout?: 'vertical' | 'horizontal'
}

const SkeletonGrid: React.FC<SkeletonGridProps> = ({ count = 14, layout = 'vertical' }) => {
  return (
    <div className="grid-container">
      {Array.from({ length: count }).map((_, i) => (
        <AnimeCardSkeleton key={i} layout={layout} />
      ))}
    </div>
  )
}

export default React.memo(SkeletonGrid)
