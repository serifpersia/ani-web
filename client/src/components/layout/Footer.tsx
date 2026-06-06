import React from 'react'
import styles from './Footer.module.css'

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear()

  return (
    <footer className={styles.footer}>
      <div className={styles.footerLinks}>
        <a href="https://github.com/serifpersia/ani-web" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        <a
          href="https://github.com/serifpersia/ani-web/issues"
          target="_blank"
          rel="noopener noreferrer"
        >
          Feedback
        </a>
        <a
          href="https://github.com/serifpersia/ani-web/releases"
          target="_blank"
          rel="noopener noreferrer"
        >
          Changelog
        </a>
      </div>

      <div className={styles.footerContent}>
        <p className={styles.copyright}>
          © {currentYear}{' '}
          <a href="/" className={styles.brand}>
            ani-web
          </a>
        </p>
        <p>
          Crafted by{' '}
          <a href="https://github.com/serifpersia" target="_blank" rel="noopener noreferrer">
            serifpersia
          </a>
        </p>
      </div>
    </footer>
  )
}

export default Footer
