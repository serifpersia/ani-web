import React from 'react'
import styles from '../../pages/Player.module.css'
import type { VideoSource } from '../../pages/Player'

interface SourceSelectorProps {
  videoSources: VideoSource[]
  selectedSource: VideoSource | null
  onSourceChange: (source: VideoSource) => void
}

const SourceSelector: React.FC<SourceSelectorProps> = ({
  videoSources,
  selectedSource,
  onSourceChange,
}) => {
  if (videoSources.length === 0) return null

  return (
    <div className={styles.sourceSelectionContainer}>
      <h4>Source</h4>
      <div className={styles.sourceButtons}>
        {videoSources.map((source) => (
          <button
            key={source.sourceName}
            className={`${styles.sourceButton} ${selectedSource?.sourceName === source.sourceName ? styles.active : ''}`}
            onClick={() => onSourceChange(source)}
          >
            {source.sourceName}
          </button>
        ))}
      </div>
    </div>
  )
}

export default React.memo(SourceSelector, (prevProps, nextProps) => {
  return (
    prevProps.selectedSource?.sourceName === nextProps.selectedSource?.sourceName &&
    prevProps.videoSources === nextProps.videoSources &&
    prevProps.onSourceChange === nextProps.onSourceChange
  )
})
