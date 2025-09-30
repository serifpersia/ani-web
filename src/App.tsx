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
    <div className={`app-container`}>
      <Header />
      <Sidebar />
      <main>
        <Suspense fallback={<div>Loading...</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/watchlist" element={<Watchlist />} />
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