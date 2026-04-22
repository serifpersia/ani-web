import React from 'react'
import styles from '../../pages/Player.module.css'
import type { VideoSource } from '../../pages/Player'

interface ProviderSelectorProps {
  selectedProvider: 'allanime' | 'hianime' | 'animepahe' | '123anime'
  onProviderChange: (provider: 'allanime' | 'hianime' | 'animepahe' | '123anime') => void
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
        onChange={(e) =>
          onProviderChange(e.target.value as 'allanime' | 'hianime' | 'animepahe' | '123anime')
        }
      >
        <option value="allanime">AllAnime</option>
        <option value="hianime">HiAnime</option>
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

  return (
    <div className={styles.sourceSelectionContainer}>
      {sources.length > 0 && (
        <>
          <h4>Source</h4>
          <select
            className={styles.sourceSelect}
            value={selectedSource?.sourceName || ''}
            onChange={(e) => {
              const source = sources.find((s) => s.sourceName === e.target.value)
              if (source) onSourceChange(source)
            }}
          >
            {sources.map((source) => (
              <option key={source.sourceName} value={source.sourceName}>
                {source.sourceName}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  )
}

export default React.memo(SourceSelector, (prevProps, nextProps) => {
  return (
    prevProps.selectedSource?.sourceName === nextProps.selectedSource?.sourceName &&
    prevProps.videoSources === nextProps.videoSources
  )
})
