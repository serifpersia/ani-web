import React, { useState, useEffect } from 'react'
import { Button } from './Button'
import { Modal as ModalUI } from './Modal'

interface RemoveConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (options: { removeFromWatchlist?: boolean; rememberPreference?: boolean }) => void
  animeName: string
  scenario: 'continueWatching' | 'watchlist'
}

export default function RemoveConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  animeName,
  scenario,
}: RemoveConfirmationModalProps) {
  const [rememberPreference, setRememberPreference] = useState(false)
  const [removeFromWatchlist, setRemoveFromWatchlist] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setRememberPreference(false)
      setRemoveFromWatchlist(false)
    }
  }, [isOpen])

  const handleConfirm = () => {
    onConfirm({
      removeFromWatchlist: scenario === 'continueWatching' ? removeFromWatchlist : true,
      rememberPreference: scenario === 'watchlist' ? rememberPreference : undefined,
    })
  }

  const title = scenario === 'continueWatching' ? 'Reset Progress' : 'Remove from Watchlist'
  const message =
    scenario === 'continueWatching'
      ? `Are you sure you want to remove your watch progress for "${animeName}"?`
      : `Are you sure you want to remove "${animeName}" from your watchlist?`

  return (
    <ModalUI isOpen={isOpen} onClose={onClose} title={title}>
      <div style={{ color: 'var(--text-secondary)' }}>
        <p>{message}</p>
        {scenario === 'continueWatching' && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              margin: '1rem 0',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={removeFromWatchlist}
              onChange={(e) => setRemoveFromWatchlist(e.target.checked)}
            />
            Also remove from my watchlist
          </label>
        )}
        {scenario === 'watchlist' && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              margin: '1rem 0',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={rememberPreference}
              onChange={(e) => setRememberPreference(e.target.checked)}
            />
            Remember my choice
          </label>
        )}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
          <Button variant="secondary" onClick={onClose} style={{ flex: 1 }}>
            No
          </Button>
          <Button variant="danger" onClick={handleConfirm} style={{ flex: 1 }}>
            Yes
          </Button>
        </div>
      </div>
    </ModalUI>
  )
}
