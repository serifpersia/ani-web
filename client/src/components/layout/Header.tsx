import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

const fetchUser = async (): Promise<UserProfile | null> => {
  const res = await fetch('/api/auth/user');
  if (!res.ok) return null;
  return res.json();
};

const Header: React.FC = () => {
  const { toggleSidebar } = useSidebar();
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(true);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const navigate = useNavigate();
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const queryClient = useQueryClient();
  const HIDE_DELAY_MS = 3000; // Hide header after 3 seconds of no scrolling

  const { data: user } = useQuery<UserProfile | null>({
    queryKey: ['user'],
    queryFn: fetchUser,
  });

  // Scroll visibility logic with debounced hide
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      // Show header when we scroll
      setVisible(true);

      // Clear existing timer
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }

      // Set new timer to hide header if not at top
      hideTimerRef.current = setTimeout(() => {
        if (window.scrollY > 100) {
          setVisible(false);
        }
      }, HIDE_DELAY_MS);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  // Handle successful Google Auth from popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
        queryClient.setQueryData(['user'], event.data.user);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [queryClient]);

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
            </button>    )}
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
