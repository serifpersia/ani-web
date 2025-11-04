import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../common/Logo';
import { useSidebar } from '../../hooks/useSidebar';
import styles from './Header.module.css';
import { FaSearch, FaFilter } from 'react-icons/fa';

const SCROLL_TIMEOUT_DURATION = 3000;

const Header: React.FC = () => {
  const { isOpen, toggleSidebar } = useSidebar();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const [visible, setVisible] = useState(true);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

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
      </div>
    </header>
  );
};

export default Header;