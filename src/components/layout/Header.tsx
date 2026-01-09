import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaBars, FaSearch, FaGoogle } from 'react-icons/fa';
import Logo from '../common/Logo';
import { useSidebar } from '../../hooks/useSidebar';
import styles from './Header.module.css';
import GenericModal from '../common/GenericModal';

interface UserProfile {
  name: string;
  picture: string;
  email: string;
}

const Header: React.FC = () => {
  const { toggleSidebar } = useSidebar();
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const navigate = useNavigate();
  const lastScrollY = useRef(0);

  // Scroll visibility logic
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
        setVisible(false);
      } else {
        setVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Auth & User logic
  useEffect(() => {
    fetch('/api/auth/user')
    .then(res => res.ok ? res.json() : null)
    .then(setUser)
    .catch(() => setUser(null));

    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
        setUser(event.data.user);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (query.trim()) {
      navigate(`/search?query=${encodeURIComponent(query.trim())}`);
    }
  };

  const handleSignIn = async () => {
    try {
      const configRes = await fetch('/api/auth/config-status');
      const { hasConfig } = await configRes.json();

      if (!hasConfig) {
        setShowConfigModal(true);
        return;
      }

      const res = await fetch('/api/auth/google');
      const { url } = await res.json();
      if (url) {
        const width = 500, height = 600;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;
        window.open(url, 'GoogleAuth', `width=${width},height=${height},top=${top},left=${left}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <header className={`${styles.header} ${visible ? '' : styles.hidden}`}>
    <div className={styles.leftSection}>
    <button className={styles.hamburgerBtn} onClick={toggleSidebar} aria-label="Menu">
    <FaBars />
    </button>
    <Link to="/" aria-label="Home">
    <Logo />
    </Link>
    </div>

    <div className={styles.rightSection}>
    <form onSubmit={handleSearch} className={styles.searchContainer}>
    <input
    type="text"
    className={styles.searchInput}
    placeholder="Search anime..."
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    />
    <FaSearch className={styles.searchIcon} />
    </form>

    {user ? (
      <Link to="/settings" className={styles.profileBtn}>
      <img src={user.picture} alt="Profile" className={styles.profileImg} />
      </Link>
    ) : (
      <button onClick={handleSignIn} className={styles.signInBtn}>
      <FaGoogle />
      <span className={styles.signInText}>Sign In</span>
      </button>
    )}
    </div>

    <GenericModal
    isOpen={showConfigModal}
    onClose={() => setShowConfigModal(false)}
    title="Configuration Required"
    >
    <p>Google Client ID/Secret missing. Please configure in settings.</p>
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
    <button className="btn-secondary" onClick={() => setShowConfigModal(false)}>Close</button>
    <button className="btn-primary" onClick={() => { setShowConfigModal(false); navigate('/settings'); }}>Settings</button>
    </div>
    </GenericModal>
    </header>
  );
};

export default Header;
