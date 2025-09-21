import React from 'react';
import { Link } from 'react-router-dom';
import Logo from '../common/Logo';
import { useSidebar } from '../../contexts/SidebarContext';
import styles from './Header.module.css';

const Header: React.FC = () => {
  const { isSidebarOpen, toggleSidebar } = useSidebar();

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
          className={`${styles.hamburgerBtn} hamburger-button ${isSidebarOpen ? styles.open : ''}`}
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
      </div>
    </header>
  );
};

export default Header;