import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../common/Logo';
import { useSidebar } from '../../hooks/useSidebar';
import styles from './Header.module.css';
import { FaSearch, FaFilter, FaGoogle, FaSignOutAlt, FaCog } from 'react-icons/fa';
import GenericModal from '../common/GenericModal';

const SCROLL_TIMEOUT_DURATION = 3000;

interface UserProfile {
  name: string;
  picture: string;
  email: string;
}

const Header: React.FC = () => {
  const { isOpen, toggleSidebar } = useSidebar();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const [visible, setVisible] = useState(true);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

  const [user, setUser] = useState<UserProfile | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);

  useEffect(() => {
    fetch('/api/auth/user')
    .then(res => {
      if (res.ok) return res.json();
      return null;
    })
    .then(data => setUser(data))
    .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
        setUser(event.data.user);
        window.location.reload();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = () => {
    if (query.trim()) {
      navigate(`/search?query=${encodeURIComponent(query.trim())}`);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  };

  const handleScroll = () => {
    if (scrollTimeout.current) {
      clearTimeout(scrollTimeout.current);
    }

    setVisible(true);

    scrollTimeout.current = setTimeout(() => {
      if (window.scrollY === 0) {
        setVisible(true);
      } else {
        setVisible(false);
      }
    }, SCROLL_TIMEOUT_DURATION);
  };

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeout.current) {
        clearTimeout(scrollTimeout.current);
      }
    };
  }, []);

  const handleSignIn = async () => {
    try {
      const configRes = await fetch('/api/auth/config-status');
      const configData = await configRes.json();

      if (!configData.hasConfig) {
        setShowConfigModal(true);
        return;
      }

      const res = await fetch('/api/auth/google');
      const data = await res.json();
      if (data.url) {
        const width = 500;
        const height = 600;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;
        window.open(
          data.url,
          'GoogleAuth',
          `width=${width},height=${height},top=${top},left=${left}`
        );
      }
    } catch (error) {
      console.error('Failed to initiate Google login', error);
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setShowDropdown(false);
      window.location.reload();
    } catch (error) {
      console.error('Failed to sign out', error);
    }
  };

  const navigateToSettings = () => {
    setShowConfigModal(false);
    navigate('/settings');
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem',
    position: 'sticky',
    top: 0,
    zIndex: 110,
    width: '100%',
    backgroundColor: 'var(--bg)',
    transition: 'transform 0.3s ease-in-out, background-color 0.2s, border-color 0.2s',
    transform: visible ? 'translateY(0)' : 'translateY(-100%)',
  };

  const leftStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  };

  const rightStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  };

  return (
    <header style={headerStyle}>
    <div style={leftStyle}>
    <button
    className={`${styles.hamburgerBtn} hamburger-button ${isOpen ? styles.open : ''}`}
    onClick={toggleSidebar}
    aria-label="Toggle navigation menu"
    >
    <span></span>
    <span></span>
    <span></span>
    </button>
    <Link to="/" className="logo-link" aria-label="Homepage">
    <Logo />
    </Link>
    </div>
    <div style={rightStyle}>
    <div className={styles.searchContainer}>
    <input
    id="search-input"
    name="search-input"
    type="text"
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    onKeyPress={handleKeyPress}
    placeholder="Search..."
    className={styles.searchInput}
    />
    <button onClick={handleSearch} className={styles.searchButton} aria-label="Search">
    <FaSearch />
    </button>
    <button onClick={() => navigate('/search')} className={styles.filterButton} aria-label="Filters">
    <FaFilter />
    </button>
    </div>

    <div className={styles.authContainer} ref={dropdownRef}>
    {user ? (
      <div className={styles.profileWrapper} onClick={() => setShowDropdown(!showDropdown)}>
      <img
      src={user.picture}
      alt="User Profile"
      className={styles.profileImage}
      referrerPolicy="no-referrer"
      />
      {showDropdown && (
        <div className={styles.dropdown}>
        <div className={styles.userInfo}>
        <p className={styles.userName}>{user.name}</p>
        <p className={styles.userEmail}>{user.email}</p>
        </div>
        <Link to="/settings" className={styles.dropdownItem} onClick={() => setShowDropdown(false)}>
        <FaCog /> Settings
        </Link>
        <button onClick={handleSignOut} className={styles.dropdownItem}>
        <FaSignOutAlt /> Sign Out
        </button>
        </div>
      )}
      </div>
    ) : (
      <button onClick={handleSignIn} className={styles.signInButton}>
      <FaGoogle />
      <span className={styles.signInText}>Sign In</span>
      </button>
    )}
    </div>
    </div>
    <GenericModal
    isOpen={showConfigModal}
    onClose={() => setShowConfigModal(false)}
    title="Google Auth Configuration Missing"
    >
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
    <p>
    To sign in with Google, you need to configure your Client ID and Client Secret in the settings.
    </p>
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
    <button className="btn-secondary" onClick={() => setShowConfigModal(false)}>
    Cancel
    </button>
    <button className="btn-primary" onClick={navigateToSettings}>
    Go to Settings
    </button>
    </div>
    </div>
    </GenericModal>
    </header>
  );
};

export default Header;
