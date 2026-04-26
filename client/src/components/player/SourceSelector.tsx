import React from 'react'
import styles from './Player.module.css'
import type { VideoSource } from '../../pages/Player'

interface ProviderSelectorProps {
  selectedProvider: 'allanime' | 'animepahe' | '123anime'
  onProviderChange: (provider: 'allanime' | 'animepahe' | '123anime') => void
}

export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  selectedProvider,
  onProviderChange,
}) => {
  return (
    <div className={styles.providerSelectContainer}>
      <h4>Provider</h4>
      <select
        className={styles.providerSelect}
        value={selectedProvider}
        onChange={(e) => onProviderChange(e.target.value as 'allanime' | 'animepahe' | '123anime')}
      >
        <option value="allanime">AllAnime</option>
        <option value="animepahe">AnimePahe</option>
        <option value="123anime">123Anime</option>
      </select>
    </div>
  )
}

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
  const sources = Array.isArray(videoSources) ? videoSources : []

  if (sources.length === 0) return null

  return (
    <div className={styles.sourceSelectionContainer}>
      <h4>Source</h4>
      <div className={styles.sourceButtons}>
        {sources.map((source) => (
          <button
            key={source.sourceName}
            className={`${styles.sourceButton} ${selectedSource?.sourceName === source.sourceName ? styles.active : ''} `}
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
    prevProps.videoSources === nextProps.videoSources
  )
})
