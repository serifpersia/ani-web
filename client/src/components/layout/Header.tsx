import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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

  const googleRes = await fetch('/api/auth/user')
  if (!googleRes.ok) return null

  const google = await googleRes.json()
  if (!google) return null

  return {
    name: google.name,
    picture: google.picture,
    email: google.email,
    provider: 'google',
  }
}

const Header: React.FC = () => {
  const { toggleSidebar } = useSidebar()
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(true)
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const navigate = useNavigate()
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null)
  const HIDE_DELAY_MS = 3000

  const { data: user } = useQuery<UserProfile | null>({
    queryKey: ['sync-profile'],
    queryFn: fetchSyncProfile,
    staleTime: 30000,
  })

  useEffect(() => {
    const handleScroll = () => {
      setVisible(true)

      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
      }

      hideTimerRef.current = setTimeout(() => {
        if (window.scrollY > 100 && !isSearchFocused) {
          setVisible(false)
        }
      }, HIDE_DELAY_MS)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
      }
    }
  }, [isSearchFocused])

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault()
    hideVirtualKeyboard()
    if (query.trim()) {
      navigate(`/search?query=${encodeURIComponent(query.trim())}`)
    }
  }

  return (
    <header className={`${styles.header} ${visible ? '' : styles.hidden}`}>
      <div className={styles.leftSection}>
        <button className={styles.hamburgerBtn} onClick={toggleSidebar} aria-label="Menu">
          <FaBars />
        </button>
        <Link to="/" className={styles.logo} aria-label="Ani-Web Home">
          <Logo />
        </Link>
      </div>

      <div className={styles.rightSection}>
        <form onSubmit={handleSearch} className={styles.searchContainer}>
          <input
            type="text"
            data-virtual-keyboard="true"
            className={styles.searchInput}
            placeholder="Search anime..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
          />
          <button type="submit" className={styles.searchButton} aria-label="Search">
            <FaSearch className={styles.searchIcon} />
          </button>
        </form>

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
    </header>
  )
}

export default Header
