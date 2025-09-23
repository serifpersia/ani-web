import React from 'react';
import { Link } from 'react-router-dom';
import { useSidebar } from '../../hooks/useSidebar';
import styles from './Sidebar.module.css';

const Sidebar: React.FC = () => {
  const { isOpen, setIsOpen } = useSidebar();

  const handleNavLinkClick = () => {
    setIsOpen(false);
  };

  return (
    <>
      <aside 
        className={`${styles.sidebar} ${isOpen ? styles.open : ''} sidebar`}
      >
        <button className={`${styles.closeBtn} closeBtn`} onClick={() => setIsOpen(false)} aria-label="Close menu">&times;</button>
        <nav>
          <Link to="/" className={`${styles.navLink} navLink`} onClick={handleNavLinkClick}>Home</Link>
          <Link to="/search" className={`${styles.navLink} navLink`} onClick={handleNavLinkClick}>Search</Link>
          <Link to="/watchlist" className={`${styles.navLink} navLink`} onClick={handleNavLinkClick}>Watchlist</Link>
          <Link to="/mal" className={`${styles.navLink} navLink`} onClick={handleNavLinkClick}>MAL Import</Link>
          <Link to="/settings" className={`${styles.navLink} navLink`} onClick={handleNavLinkClick}>Settings</Link>
        </nav>
      </aside>
      {isOpen && <div className={styles.overlay} onClick={() => setIsOpen(false)} aria-label="Close sidebar" />} 
    </>
  );
};

export default Sidebar;