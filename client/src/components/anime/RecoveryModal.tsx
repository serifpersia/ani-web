import { useState } from 'react'
import { Button } from '../common/Button'

const styleId = 'recovery-modal-keyframes'
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `@keyframes rspin { to { transform: rotate(360deg) } }`
  document.head.appendChild(style)
}

interface RecoveryModalProps {
  show: boolean
  onClose: () => void
}

type State = 'confirm' | 'running' | 'success' | 'error'

export default function RecoveryModal({ show, onClose }: RecoveryModalProps) {
  const [state, setState] = useState<State>('confirm')
  const [errorMsg, setErrorMsg] = useState('')

  if (!show) return null

  const start = async () => {
    setState('running')
    try {
      const res = await fetch('/api/recover-allanime', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setState('success')
      } else {
        setState('error')
        setErrorMsg(data.error || 'Unknown error')
      }
    } catch (err) {
      setState('error')
      setErrorMsg(err instanceof Error ? err.message : 'Network error')
    }
  }

  const overlaySx: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '1rem',
    backdropFilter: 'blur(3px)',
  }

  const cardSx: React.CSSProperties = {
    backgroundColor: 'var(--bg-secondary)',
    padding: '2rem',
    borderRadius: 'var(--radius-lg)',
    maxWidth: '420px',
    width: '100%',
    boxShadow: 'var(--shadow-xl)',
    border: '1px solid var(--border-primary)',
    textAlign: 'center',
  }

  return (
    <div style={overlaySx} onClick={onClose}>
      <div style={cardSx} onClick={(e) => e.stopPropagation()}>
        {state === 'confirm' && (
          <>
            <h3 style={{ margin: '0 0 0.75rem' }}>AllAnime Connection Issue</h3>
            <p
              style={{ color: 'var(--text-secondary)', margin: '0 0 1.5rem', fontSize: '0.95rem' }}
            >
              AllAnime appears to be unavailable. Auto-recovery will fetch new crypto constants and
              re-bootstrap the provider. Continue?
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={start}>Recover</Button>
            </div>
          </>
        )}

        {state === 'running' && (
          <>
            <div
              style={{
                width: 40,
                height: 40,
                border: '4px solid var(--border-primary)',
                borderTopColor: 'var(--accent)',
                borderRadius: '50%',
                animation: 'rspin 0.8s linear infinite',
                margin: '0 auto 1rem',
              }}
            />
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
              Attempting to recover AllAnime…
            </p>
          </>
        )}

        {state === 'success' && (
          <>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                backgroundColor: 'var(--accent)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
                margin: '0 auto 1rem',
              }}
            >
              &#10003;
            </div>
            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--accent)' }}>Recovery Successful</h3>
            <p
              style={{ color: 'var(--text-secondary)', margin: '0 0 1.5rem', fontSize: '0.95rem' }}
            >
              AllAnime is working again. Restart the server to persist these changes.
            </p>
            <Button onClick={onClose}>OK</Button>
          </>
        )}

        {state === 'error' && (
          <>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                backgroundColor: 'var(--danger-color)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
                margin: '0 auto 1rem',
              }}
            >
              &#10007;
            </div>
            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--danger-color)' }}>Recovery Failed</h3>
            <p
              style={{ color: 'var(--text-secondary)', margin: '0 0 1.5rem', fontSize: '0.95rem' }}
            >
              {errorMsg || 'Could not auto-recover AllAnime. Wait for an app update.'}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              <Button onClick={start}>Retry</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
