import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { Button } from '../common/Button'
import type { Anime } from '../../hooks/useAnimeData'
import { fixThumbnailUrl } from '../../lib/utils'
import styles from './SpotlightBanner.module.css'
import { useLowEndMode } from '../../contexts/LowEndModeContext'
import { useTitlePreference } from '../../contexts/TitlePreferenceContext'
import useIsMobile from '../../hooks/useIsMobile'

interface SpotlightBannerProps {
  animeList: Anime[]
}

interface ShowMeta {
  description?: string
  genres?: { name: string; route?: string }[]
  bannerImage?: string
  thumbnail?: string
  season?: { title?: string }
  score?: number
  status?: string
}

const fetchShowMeta = async (id: string): Promise<ShowMeta> => {
  const res = await fetch(`/api/show-meta/${id}`)
  if (!res.ok) return {}
  return res.json()
}

const SpotlightBanner: React.FC<SpotlightBannerProps> = ({ animeList }) => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [lastScrollTime, setLastScrollTime] = useState(0)
  const { lowEndMode } = useLowEndMode()
  const isMobile = useIsMobile()
  const { titlePreference } = useTitlePreference()
  const navigate = useNavigate()
  const top6 = animeList.slice(0, 6)

  const getTitle = (anime: Anime) => {
    switch (titlePreference) {
      case 'nativeName':
        return anime.nativeName || anime.name
      case 'englishName':
        return anime.englishName || anime.name
      default:
        return anime.name
    }
  }

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % top6.length)
  }, [top6.length])

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + top6.length) % top6.length)
  }, [top6.length])

  useEffect(() => {
    if (top6.length === 0) return
    const timer = setTimeout(nextSlide, 10000)
    return () => clearTimeout(timer)
  }, [currentIndex, nextSlide, top6.length])

  const metaQueries = useQueries({
    queries: top6.map((anime) => ({
      queryKey: ['spotlight-meta', anime._id],
      queryFn: () => fetchShowMeta(anime._id),
      enabled: !!anime._id,
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      refetchOnMount: true,
      refetchOnWindowFocus: true,
    })),
  })

  if (top6.length === 0) return null

  const anime = top6[currentIndex]
  const meta: ShowMeta = metaQueries[currentIndex]?.data ?? {}

  const rawDesc = meta.description ?? ''
  const synopsis = rawDesc.replace(/<[^>]*>?/gm, '').trim()
  const genres: { name: string }[] = meta.genres ?? []
  const visibleGenres = genres.slice(0, isMobile ? 2 : 4)
  const visibleSynopsis = isMobile ? synopsis.slice(0, 120) : synopsis

  const bannerSrc = meta.bannerImage
    ? fixThumbnailUrl(meta.bannerImage)
    : fixThumbnailUrl(anime.thumbnail, 1280, 450)

  const handleWatch = () => {
    navigate(`/watch/${anime._id}`)
  }

  const handleWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && Math.abs(e.deltaY) > 5) {
      e.preventDefault()
      e.stopPropagation()
      const now = Date.now()
      if (now - lastScrollTime < 300) return
      setLastScrollTime(now)
      if (e.deltaY > 0) nextSlide()
      else prevSlide()
    }
  }

  return (
    <div className={styles.bannerContainer}>
      <div
        className={styles.posterWrapper}
        style={{ boxShadow: !lowEndMode ? '0 10px 30px rgba(0,0,0,0.5)' : 'none' }}
      >
        <img
          key={currentIndex}
          src={bannerSrc}
          alt={getTitle(anime)}
          className={`${styles.posterImage} ${!lowEndMode ? styles.fadeIn : ''}`}
        />
        <div className={styles.overlay}>
          <div className={styles.content}>
            <h2
              className={styles.title}
              onClick={() => navigate(`/anime/${anime._id}`)}
              style={{ cursor: 'pointer' }}
            >
              {getTitle(anime)}
            </h2>

            {visibleGenres.length > 0 && (
              <div className={styles.genres}>
                {visibleGenres.map((g) => (
                  <span key={g.name} className={styles.genreTag}>
                    {g.name}
                  </span>
                ))}
              </div>
            )}

            {visibleSynopsis && (
              <p className={styles.summary}>
                {visibleSynopsis.length < synopsis.length ? visibleSynopsis + '…' : visibleSynopsis}
              </p>
            )}

            <Button variant="primary" size={isMobile ? 'md' : 'lg'} onClick={handleWatch}>
              Watch Now
            </Button>
          </div>

          <div className={styles.carouselControls} onWheel={handleWheel}>
            {top6.map((_, index) => (
              <div
                key={index}
                className={`${styles.dot} ${index === currentIndex ? styles.activeDot : ''}`}
                onClick={() => setCurrentIndex(index)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SpotlightBanner
