import React from 'react'
import styles from '../../pages/Player.module.css'
import type { VideoSource } from '../../pages/Player'

interface SourceSelectorProps {
  videoSources: VideoSource[]
  selectedSource: VideoSource | null
  onSourceChange: (source: VideoSource) => void
  selectedProvider: 'allanime' | 'hianime' | 'animepahe' | '123anime'
  onProviderChange: (provider: 'allanime' | 'hianime' | 'animepahe' | '123anime') => void
}

const SourceSelector: React.FC<SourceSelectorProps> = ({
  videoSources,
  selectedSource,
  onSourceChange,
  selectedProvider,
  onProviderChange,
}) => {
  const sources = Array.isArray(videoSources) ? videoSources : []

  return (
    <div className={styles.sourceSelectionContainer}>
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

      {sources.length > 0 && (
        <>
          <h4>Source</h4>
          {selectedProvider === 'animepahe' ? (
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
          ) : (
            <div className={styles.sourceButtons}>
              {sources.map((source) => (
                <button
                  key={source.sourceName}
                  className={`${styles.sourceButton} ${
                    selectedSource?.sourceName === source.sourceName ? styles.active : ''
                  }`}
                  onClick={() => onSourceChange(source)}
                >
                  {source.sourceName}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default React.memo(SourceSelector, (prevProps, nextProps) => {
  return (
    prevProps.selectedSource?.sourceName === nextProps.selectedSource?.sourceName &&
    prevProps.videoSources === nextProps.videoSources &&
    prevProps.selectedProvider === nextProps.selectedProvider
  )
})
