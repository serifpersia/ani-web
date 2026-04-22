import React from 'react'
import { useEffect } from 'preact/hooks'
import './Modal.css'

interface Props {
  isOpen: boolean
  onClose?: () => void
  title?: string
  children?: React.ReactNode
  footer?: React.ReactNode
  width?: 'sm' | 'md' | 'lg'
}

export function Modal({ isOpen, onClose, title, children, footer, width = 'md' }: Props) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-content modal-${width}`} onClick={(e) => e.stopPropagation()}>
        {title && <h2 className="modal-title">{title}</h2>}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

export function ModalOverlay({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean
  onClose?: () => void
  children: ComponentChildren
}) {
  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      {children}
    </div>
  )
}
