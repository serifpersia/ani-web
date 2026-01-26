import React from 'react';
import AnimeCardSkeleton from '../anime/AnimeCardSkeleton';

interface SkeletonGridProps {
    count?: number;
}

const SkeletonGrid: React.FC<SkeletonGridProps> = ({ count = 12 }) => {
    return (
        <div className="grid-container">
        {Array.from({ length: count }).map((_, i) => (
            <AnimeCardSkeleton key={i} />
        ))}
        </div>
    );
};

export default React.memo(SkeletonGrid);