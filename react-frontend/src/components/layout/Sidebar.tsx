import React from 'react';
import { Link } from 'react-router-dom';
import { useSidebar } from '../../contexts/SidebarContext';
import styles from './Sidebar.module.css';

const Sidebar: React.FC = () => {
  const { isSidebarOpen, closeSidebar } = useSidebar();

  const handleNavLinkClick = () => {
    closeSidebar();
  };

  return (
    <>
      <aside 
        className={`${styles.sidebar} ${isSidebarOpen ? styles.open : ''} sidebar`}
      >
        <button className={`${styles.closeBtn} closeBtn`} onClick={closeSidebar} aria-label="Close menu">&times;</button>
        <nav>
          <Link to="/" className={`${styles.navLink} navLink`} onClick={handleNavLinkClick}>Home</Link>
          <Link to="/search" className={`${styles.navLink} navLink`} onClick={handleNavLinkClick}>Search</Link>
          <Link to="/watchlist" className={`${styles.navLink} navLink`} onClick={handleNavLinkClick}>Watchlist</Link>
          <Link to="/settings" className={`${styles.navLink} navLink`} onClick={handleNavLinkClick}>Settings</Link>
        </nav>
      </aside>
      {isSidebarOpen && <div className={styles.overlay} onClick={closeSidebar} aria-label="Close sidebar" />} 
    </>
  );
};

export default Sidebar;