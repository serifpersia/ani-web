import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FaBars, FaCloud, FaGithub, FaSearch } from 'react-icons/fa'
import NotificationBell from './NotificationBell'
import Logo from '../common/Logo'
import { useSidebar } from '../../hooks/useSidebar'
import { hideVirtualKeyboard } from '../../hooks/useVirtualKeyboard'
import styles from './Header.module.css'

interface UserProfile {
  name: string
  picture?: string
  email?: string
  provider: 'github' | 'google' | 'none'
}

const fetchSyncProfile = async (): Promise<UserProfile | null> => {
  const settingsRes = await fetch('/api/auth/settings/sync')
  if (!settingsRes.ok) return null

  const settings = await settingsRes.json()
  const activeProvider = settings.actualActiveProvider as 'github' | 'google' | 'rclone' | 'none'

  if (activeProvider === 'github') {
    const githubRes = await fetch('/api/auth/github/status')
    if (githubRes.ok) {
      const github = await githubRes.json()
      if (github.authenticated && github.user) {
        return {
          name: github.user.name || github.user.login,
          picture: github.user.avatarUrl,
          provider: 'github',
        }
      }
    }
  }

  if (activeProvider === 'google') {
    const googleRes = await fetch('/api/auth/user')
    if (googleRes.ok) {
      const google = await googleRes.json()
      if (google) {
        return {
          name: google.name,
          picture: google.picture,
          email: google.email,
          provider: 'google',
        }
      }
    }
  }

  return null
}

const Header: React.FC = () => {
  const { toggleSidebar } = useSidebar()
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(true)
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const lastScrollY = useRef(0)
  const isHome = location.pathname === '/'

  const { data: user } = useQuery<UserProfile | null>({
    queryKey: ['sync-profile'],
    queryFn: fetchSyncProfile,
    staleTime: 30000,
  })

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY

      if (currentScrollY > 100 && currentScrollY > lastScrollY.current && !isSearchFocused) {
        setVisible(false)
      } else if (currentScrollY < lastScrollY.current || currentScrollY <= 100) {
        setVisible(true)
      }

      lastScrollY.current = currentScrollY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [isSearchFocused])

  const searchInputRef = React.useRef<HTMLInputElement>(null)

  const handleSearchButtonClick = () => {
    searchInputRef.current?.focus()
  }

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault()
    hideVirtualKeyboard()
    if (query.trim()) {
      navigate(`/search?query=${encodeURIComponent(query.trim())}`)
    }
  }

  return (
    <header
      className={`${styles.header} ${visible ? '' : styles.hidden} ${!isHome ? styles.notHome : ''}`}
    >
      <div className={styles.headerInner}>
        <div className={styles.leftSection}>
          <button className={styles.hamburgerBtn} onClick={toggleSidebar} aria-label="Menu">
            <FaBars />
          </button>
          {!isHome && (
            <Link to="/" className={styles.logo} aria-label="Ani-Web Home">
              <Logo />
            </Link>
          )}
        </div>

        <div className={styles.rightSection}>
          <div className={styles.searchWrapper}>
            <input
              ref={searchInputRef}
              type="text"
              data-virtual-keyboard="true"
              className={styles.searchInput}
              placeholder="Search anime..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearch()
                }
              }}
            />
            <button
              type="button"
              className={styles.searchButton}
              aria-label="Search"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleSearchButtonClick}
            >
              <FaSearch className={styles.searchIcon} />
            </button>
          </div>

          <NotificationBell />

          <Link to="/settings?tab=sync" className={styles.profileBtn} aria-label="Sync settings">
            {user?.picture ? (
              <img
                src={user.picture}
                alt={user.name}
                className={styles.profileImg}
                referrerPolicy="no-referrer"
              />
            ) : user?.provider === 'github' ? (
              <FaGithub />
            ) : (
              <FaCloud />
            )}
          </Link>
        </div>
      </div>
    </header>
  )
}

export default Header
