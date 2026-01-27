import React from 'react';
import { Link } from 'react-router-dom';
import { useSidebar } from '../../hooks/useSidebar';
import styles from './Sidebar.module.css';
import { FaHome, FaSearch, FaClock, FaFileImport, FaCog, FaChartPie } from 'react-icons/fa';
import Logo from '../common/Logo';

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
        <div className={styles.sidebarHeader}>
          <Link to="/" className={styles.logo} onClick={handleNavLinkClick}>
            <Logo />
          </Link>
          <button className={`${styles.closeBtn} closeBtn`} onClick={() => setIsOpen(false)} aria-label="Close menu">&times;</button>
        </div>
        <nav>
          <Link to="/" className={`${styles.navLink} navLink`} onClick={handleNavLinkClick}>
            <FaHome /> Home
          </Link>
          <Link to="/search" className={`${styles.navLink} navLink`} onClick={handleNavLinkClick}>
            <FaSearch /> Search
          </Link>
          <Link to="/watchlist" className={`${styles.navLink} navLink`} onClick={handleNavLinkClick}>
            <FaClock /> Watchlist
          </Link>
          <Link to="/insights" className={`${styles.navLink} navLink`} onClick={handleNavLinkClick}>
            <FaChartPie /> Insights
          </Link>
          <Link to="/mal" className={`${styles.navLink} navLink`} onClick={handleNavLinkClick}>
            <FaFileImport /> MAL Import
          </Link>
          <Link to="/settings" className={`${styles.navLink} navLink`} onClick={handleNavLinkClick}>
            <FaCog /> Settings
          </Link>
        </nav>
      </aside>
      {isOpen && <div className={styles.overlay} onClick={() => setIsOpen(false)} aria-label="Close sidebar" />}
    </>
  );
};

export default Sidebar;