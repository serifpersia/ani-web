import React from 'react'
import styles from './ResumeModal.module.css'

interface ResumeModalProps {
  show: boolean
  resumeTime: string
  onResume: () => void
  onStartOver: () => void
}

const ResumeModal: React.FC<ResumeModalProps> = ({ show, resumeTime, onResume, onStartOver }) => {
  if (!show) {
    return null
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h3>Resume Playback?</h3>
        <p>
          You were watching at <strong>{resumeTime}</strong>. Would you like to continue?
        </p>
        <div className={styles.modalActions}>
          <button className="btn-secondary" onClick={onStartOver}>
            Start Over
          </button>
          <button className="btn-primary" onClick={onResume}>
            Resume
          </button>
        </div>
      </div>
    </div>
  )
}

export default ResumeModal
