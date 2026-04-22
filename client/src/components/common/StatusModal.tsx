import React from 'react'
import { Button } from './Button'

interface StatusModalProps {
  show: boolean
  message: string
  type: 'success' | 'error' | 'info'
  onClose: () => void
  showConfirmButton?: boolean
  onConfirm?: () => void
  confirmButtonText?: string
  cancelButtonText?: string
}

export default function StatusModal({
  show,
  message,
  type,
  onClose,
  showConfirmButton = false,
  onConfirm,
  confirmButtonText = 'Confirm',
  cancelButtonText = 'Cancel',
}: StatusModalProps) {
  if (!show) return null

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
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-secondary)',
          padding: '1.5rem',
          borderRadius: 'var(--radius-lg)',
          maxWidth: '400px',
          width: '100%',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--border-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{message}</p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          {showConfirmButton ? (
            <>
              <Button variant="secondary" onClick={onClose}>
                {cancelButtonText}
              </Button>
              <Button variant="danger" onClick={onConfirm}>
                {confirmButtonText}
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>OK</Button>
          )}
        </div>
      </div>
    </div>
  )
}
