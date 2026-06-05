import { useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom'
import Header from './components/layout/Header'
import Sidebar from './components/layout/Sidebar'
import Footer from './components/layout/Footer'
import ScrollToTopButton from './components/common/ScrollToTopButton'
import { useTelemetry } from './hooks/useTelemetry'
import VirtualKeyboard from './components/common/VirtualKeyboard'
import { useVirtualKeyboard } from './hooks/useVirtualKeyboard'

function useDiscordPageStatus() {
  const location = useLocation()

  useEffect(() => {
    const path = location.pathname

    if (path.startsWith('/watch/') || path.startsWith('/player/')) return

    let page = 'home'
    if (path.startsWith('/search')) page = 'search'
    else if (path.startsWith('/watchlist')) page = 'watchlist'
    else if (path.startsWith('/anime/')) page = 'anime'
    else if (path.startsWith('/insights')) page = 'insights'
    else if (path.startsWith('/settings')) page = 'settings'
    else if (path.startsWith('/mal')) page = 'mal'

    fetch('/api/discord/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page }),
    }).catch(() => {})
  }, [location.pathname])
}

const Home = lazy(() => import('./pages/Home'))
const Watchlist = lazy(() => import('./pages/Watchlist'))
const Settings = lazy(() => import('./pages/Settings'))
const Player = lazy(() => import('./pages/Player'))
const Search = lazy(() => import('./pages/Search'))
const MAL = lazy(() => import('./pages/MAL'))
const Insights = lazy(() => import('./pages/Insights'))
const AnimeInfoPage = lazy(() => import('./pages/AnimeInfoPage'))

import { useSidebar } from './hooks/useSidebar'
import { Toaster } from 'react-hot-toast'
import TopProgressBar from './components/common/TopProgressBar'
import ErrorBoundary from './components/common/ErrorBoundary'

const PlayerRedirect = () => {
  const { id, episodeNumber } = useParams()
  return <Navigate to={episodeNumber ? `/watch/${id}/${episodeNumber}` : `/watch/${id}`} replace />
}

function App() {
  const { isOpen, setIsOpen } = useSidebar()
  const virtualKeyboard = useVirtualKeyboard()
  useTelemetry()
  useDiscordPageStatus()

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (isOpen && event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.body.classList.add('sidebar-open')
    } else {
      document.body.classList.remove('sidebar-open')
    }

    window.addEventListener('keydown', handleKeydown)

    return () => {
      window.removeEventListener('keydown', handleKeydown)
      document.body.classList.remove('sidebar-open')
    }
  }, [isOpen, setIsOpen])

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
        <ErrorBoundary>
          <Suspense fallback={<TopProgressBar />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/watchlist/:filter?" element={<Watchlist />} />
              <Route path="/search" element={<Search />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/mal" element={<MAL />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/anime/:id" element={<AnimeInfoPage />} />
              <Route path="/watch/:id" element={<Player />} />
              <Route path="/watch/:id/:episodeNumber" element={<Player />} />
              <Route path="/player/:id" element={<PlayerRedirect />} />
              <Route path="/player/:id/:episodeNumber" element={<PlayerRedirect />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
      <ScrollToTopButton />
      <VirtualKeyboard
        activeInputRef={virtualKeyboard.activeInputRef}
        isVisible={virtualKeyboard.isVisible}
        onClose={virtualKeyboard.hide}
      />
    </div>
  )
}

export default App
