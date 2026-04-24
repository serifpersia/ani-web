import React from 'react'
import { Button } from './Button'

interface ResumeModalProps {
  show: boolean
  resumeTime: string
  onResume: () => void
  onStartOver: () => void
  onNextEpisode?: () => void
  hasNextEpisode?: boolean
  isCompleted?: boolean
}

export default function ResumeModal({
  show,
  resumeTime,
  onResume,
  onStartOver,
  onNextEpisode,
  hasNextEpisode,
  isCompleted,
}: ResumeModalProps) {
  if (!show) return null

  if (isCompleted) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem',
          backdropFilter: 'blur(3px)',
        }}
        onClick={onStartOver}
      >
        <div
          style={{
            backgroundColor: 'var(--bg-secondary)',
            padding: '1.5rem',
            borderRadius: 'var(--radius-lg)',
            maxWidth: '420px',
            width: '100%',
            boxShadow: 'var(--shadow-xl)',
            border: '1px solid var(--border-primary)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ margin: '0 0 0.75rem', color: 'var(--text-primary)' }}>
            Episode Completed!
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            {hasNextEpisode
              ? 'You finished this episode. Ready for the next one?'
              : 'You finished this episode. Want to watch again?'}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button variant="secondary" onClick={onStartOver} style={{ flex: 1 }}>
              {hasNextEpisode ? 'Replay' : 'Start Over'}
            </Button>
            {hasNextEpisode && (
              <Button onClick={onNextEpisode} style={{ flex: 1 }}>
                Next Episode
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
        backdropFilter: 'blur(3px)',
      }}
      onClick={onStartOver}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-secondary)',
          padding: '1.5rem',
          borderRadius: 'var(--radius-lg)',
          maxWidth: '420px',
          width: '100%',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--border-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--text-primary)' }}>Resume Playback?</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          You were watching at <strong style={{ color: 'var(--accent)' }}>{resumeTime}</strong>.
          Would you like to continue?
        </p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="secondary" onClick={onStartOver} style={{ flex: 1 }}>
            Start Over
          </Button>
          <Button onClick={onResume} style={{ flex: 1 }}>
            Resume
          </Button>
        </div>
      </div>
    </div>
  )
}
