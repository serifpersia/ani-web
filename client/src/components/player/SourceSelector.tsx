import React from 'react'
import styles from '../../pages/Player.module.css'
import type { VideoSource } from '../../pages/Player'

interface SourceSelectorProps {
  videoSources: VideoSource[]
  selectedSource: VideoSource | null
  onSourceChange: (source: VideoSource) => void
  selectedProvider: 'allanime' | 'hianime'
  onProviderChange: (provider: 'allanime' | 'hianime') => void
}

const SourceSelector: React.FC<SourceSelectorProps> = ({
  videoSources,
  selectedSource,
  onSourceChange,
  selectedProvider,
  onProviderChange,
}) => {
  return (
    <div className={styles.sourceSelectionContainer}>
      <div className={styles.providerSelectContainer}>
        <h4>Provider</h4>
        <select
          className={styles.providerSelect}
          value={selectedProvider}
          onChange={(e) => onProviderChange(e.target.value as 'allanime' | 'hianime')}
        >
          <option value="allanime">AllAnime</option>
          <option value="hianime">HiAnime</option>
        </select>
      </div>

      {videoSources.length > 0 && (
        <>
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
        </>
      )}
    </div>
  )
}

export default React.memo(SourceSelector, (prevProps, nextProps) => {
  return (
    prevProps.selectedSource?.sourceName === nextProps.selectedSource?.sourceName &&
    prevProps.videoSources === nextProps.videoSources &&
    prevProps.onSourceChange === nextProps.onSourceChange &&
    prevProps.selectedProvider === nextProps.selectedProvider &&
    prevProps.onProviderChange === nextProps.onProviderChange
  )
})
