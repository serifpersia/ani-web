import React from 'react'
import styles from './PlayerStatusArea.module.css'
import { FaArrowUp, FaArrowDown, FaArrowLeft, FaArrowRight } from 'react-icons/fa'

const PlayerStatusArea: React.FC = () => {
  return (
    <div className={styles.statusArea}>
      <div className={styles.shortcuts}>
        <div className={styles.shortcutGroup}>
          <div className={styles.shortcut}>
            <span className={styles.key}>
              <FaArrowUp size={10} />
            </span>
            <span className={styles.key}>
              <FaArrowDown size={10} />
            </span>
            <span className={styles.label}>Volume</span>
          </div>
          <div className={styles.shortcut}>
            <span className={styles.key}>
              <FaArrowLeft size={10} />
            </span>
            <span className={styles.key}>
              <FaArrowRight size={10} />
            </span>
            <span className={styles.label}>Seek</span>
          </div>
        </div>

        <div className={styles.shortcutGroup}>
          <div className={styles.shortcut}>
            <span className={styles.key}>Space</span>
            <span className={styles.label}>Play/Pause</span>
          </div>
          <div className={styles.shortcut}>
            <span className={styles.key}>F</span>
            <span className={styles.label}>Fullscreen</span>
          </div>
          <div className={styles.shortcut}>
            <span className={styles.key}>M</span>
            <span className={styles.label}>Mute</span>
          </div>
          <div className={styles.shortcut}>
            <span className={styles.key}>T</span>
            <span className={styles.label}>Theater</span>
          </div>
          <div className={styles.shortcut}>
            <span className={styles.key}>N</span>
            <span className={styles.label}>Next</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PlayerStatusArea
