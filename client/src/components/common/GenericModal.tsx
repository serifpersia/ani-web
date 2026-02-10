import React from 'react'
import ReactDOM from 'react-dom'
import styles from './GenericModal.module.css'

interface GenericModalProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
}

const GenericModal: React.FC<GenericModalProps> = ({ isOpen, onClose, children, title }) => {
  if (!isOpen) {
    return null
  }

  return ReactDOM.createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.content} onClick={(e) => e.stopPropagation()}>
        {title && <h3 className={styles.title}>{title}</h3>}
        {children}
      </div>
    </div>,
    document.body
  )
}

export default GenericModal
