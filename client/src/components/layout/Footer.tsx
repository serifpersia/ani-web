import React from 'react'
import styles from './Footer.module.css'

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear()

  return (
    <footer className={styles.footer}>
      <p>
        © {currentYear}{' '}
        <a href="https://github.com/serifpersia/ani-web" target="_blank" rel="noopener noreferrer">
          ani-web
        </a>
        {' | Created by '}
        <a href="https://github.com/serifpersia" target="_blank" rel="noopener noreferrer">
          serifpersia
        </a>
      </p>
    </footer>
  )
}

export default Footer
