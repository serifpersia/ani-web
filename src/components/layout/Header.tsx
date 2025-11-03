import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../common/Logo';
import { useSidebar } from '../../hooks/useSidebar';
import styles from './Header.module.css';
import { FaSearch, FaFilter } from 'react-icons/fa';

const Header: React.FC = () => {
  const { isOpen, toggleSidebar } = useSidebar();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

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

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem',
    position: 'relative',
    zIndex: 110,
    transition: 'background-color 0.2s, border-color 0.2s',
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