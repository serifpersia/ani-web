import { useEffect, Suspense, lazy } from 'react'; // Modified import
import { Routes, Route } from 'react-router-dom';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import Footer from './components/layout/Footer';
// Lazy-loaded page components
const Home = lazy(() => import('./pages/Home'));
const Watchlist = lazy(() => import('./pages/Watchlist'));
const Settings = lazy(() => import('./pages/Settings'));
const Player = lazy(() => import('./pages/Player'));
const Search = lazy(() => import('./pages/Search')); // Lazy-load Search as well

import { useSidebar } from './contexts/SidebarContext';

function App() {
  const { isSidebarOpen, closeSidebar } = useSidebar();

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (isSidebarOpen && event.key === 'Escape') {
        closeSidebar();
      }
    };

    window.addEventListener('keydown', handleKeydown);

    return () => {
      window.removeEventListener('keydown', handleKeydown);
    };
  }, [isSidebarOpen, closeSidebar]);

  return (
    <div className={`app-container ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      <Header />
      <Sidebar />
      <main>
        <Suspense fallback={<div>Loading...</div>}> {/* Added Suspense */}
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/search" element={<Search />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/player/:id" element={<Player />} />
            <Route path="/player/:id/:episodeNumber" element={<Player />} />
          </Routes>
        </Suspense> {/* Closed Suspense */}
      </main>
      <Footer />
    </div>
  );
}

export default App;