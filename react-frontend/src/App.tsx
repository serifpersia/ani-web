

import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import Footer from './components/layout/Footer';
import Home from './pages/Home';
import Watchlist from './pages/Watchlist';
import Settings from './pages/Settings';
import Player from './pages/Player';
import { useSidebar } from './contexts/SidebarContext';

import Search from './pages/Search';

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
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/search" element={<Search />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/player/:id" element={<Player />} />
          <Route path="/player/:id/:episodeNumber" element={<Player />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default App;
