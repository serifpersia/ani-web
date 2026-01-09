import { useEffect, Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import Footer from './components/layout/Footer';

const Home = lazy(() => import('./pages/Home'));
const Watchlist = lazy(() => import('./pages/Watchlist'));
const Settings = lazy(() => import('./pages/Settings'));
const Player = lazy(() => import('./pages/Player'));
const Search = lazy(() => import('./pages/Search'));
const MAL = lazy(() => import('./pages/MAL'));

import { useSidebar } from './hooks/useSidebar';
import { Toaster } from 'react-hot-toast';
import TopProgressBar from './components/common/TopProgressBar';

function App() {
  const { isOpen, setIsOpen } = useSidebar();

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (isOpen && event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.body.classList.add('sidebar-open');
    } else {
      document.body.classList.remove('sidebar-open');
    }

    window.addEventListener('keydown', handleKeydown);

    return () => {
      window.removeEventListener('keydown', handleKeydown);
      document.body.classList.remove('sidebar-open');
    };
  }, [isOpen, setIsOpen]);

  return (
    <div className="app-container">
    <Toaster
    position="top-center"
    toastOptions={{
      style: {
        background: '#262829',
        color: '#fff',
        border: '1px solid #444',
      },
      success: {
        style: {
          background: 'var(--accent)',
          color: '#fff',
        },
        iconTheme: {
          primary: '#fff',
          secondary: 'var(--accent)',
        },
      },
      error: {
        style: {
          background: '#992a2a',
          color: '#fff',
        },
      },
    }}
    />
    <Header />
    <Sidebar />
    <main>
    <Suspense fallback={<TopProgressBar />}>
    <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/watchlist/:filter?" element={<Watchlist />} />
    <Route path="/search" element={<Search />} />
    <Route path="/settings" element={<Settings />} />
    <Route path="/mal" element={<MAL />} />
    <Route path="/player/:id" element={<Player />} />
    <Route path="/player/:id/:episodeNumber" element={<Player />} />
    </Routes>
    </Suspense>
    </main>
    <Footer />
    </div>
  );
}

export default App;
