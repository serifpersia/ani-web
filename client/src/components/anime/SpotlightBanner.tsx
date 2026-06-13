import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { FaChevronLeft, FaChevronRight, FaStar } from 'react-icons/fa'
import { Button } from '../common/Button'
import type { Anime } from '../../hooks/useAnimeData'
import { fixThumbnailUrl } from '../../lib/utils'
import styles from './SpotlightBanner.module.css'
import { useLowEndMode } from '../../contexts/LowEndModeContext'
import { useTitlePreference } from '../../contexts/TitlePreferenceContext'
import useIsMobile from '../../hooks/useIsMobile'

import { fetchApi } from '../../lib/fetchApi'

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
  type?: string
  episodeCount?: number
  rating?: string
}

const fetchShowMeta = async (id: string): Promise<ShowMeta> => {
  try {
    return await fetchApi(`/api/show-meta/${id}`)
  } catch {
    return {}
  }
}

const SpotlightBanner: React.FC<SpotlightBannerProps> = ({ animeList }) => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [autoplayResetKey, setAutoplayResetKey] = useState(0)
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

  const resetAutoplay = useCallback(() => {
    setAutoplayResetKey((k) => k + 1)
  }, [])

  const selectSlide = useCallback(
    (index: number) => {
      resetAutoplay()
      setCurrentIndex(index)
    },
    [resetAutoplay]
  )

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
  }, [currentIndex, nextSlide, top6.length, autoplayResetKey])

  const metaQueries = useQueries({
    queries: top6.map((anime) => ({
      queryKey: ['spotlight-meta', anime._id],
      queryFn: () => fetchShowMeta(anime._id),
      enabled: !!anime._id,
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
    })),
  })

  if (top6.length === 0) return null

  const anime = top6[currentIndex]
  const meta: ShowMeta = metaQueries[currentIndex]?.data ?? {}

  const rawDesc = meta.description ?? ''
  const synopsis = rawDesc.replace(/<[^>]*>?/gm, '').trim()
  const genres: { name: string }[] = meta.genres ?? []
  const visibleGenres = genres.slice(0, isMobile ? 2 : 4)

  const bannerSrc = meta.bannerImage
    ? fixThumbnailUrl(meta.bannerImage, 1920, 840)
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
      resetAutoplay()
      if (e.deltaY > 0) nextSlide()
      else prevSlide()
    }
  }

  const metadata = [
    meta.type || 'Anime',
    meta.status,
    meta.episodeCount ? `${meta.episodeCount} Episodes` : undefined,
    meta.rating,
  ].filter(Boolean)

  if (isMobile) return null

  return (
    <div className={styles.bannerContainer}>
      <div className={styles.posterWrapper}>
        <img
          key={`${currentIndex}-${autoplayResetKey}`}
          src={bannerSrc}
          alt={getTitle(anime)}
          className={`${styles.posterImage} ${!lowEndMode ? styles.fadeIn : ''}`}
        />

        <div className={styles.overlay}>
          <div className={styles.content}>
            <div className={styles.badgeRow}>
              <span className={styles.featureLabel}>Featured</span>
              {meta.score && (
                <div className={styles.metaRow} style={{ color: '#fbbf24' }}>
                  <FaStar size={14} />
                  <span>{meta.score}</span>
                </div>
              )}
            </div>

            <h1 className={styles.title} onClick={() => navigate(`/anime/${anime._id}`)}>
              {getTitle(anime)}
            </h1>

            <div className={styles.metaRow}>
              {metadata.map((item, idx) => (
                <React.Fragment key={idx}>
                  <span className={styles.metaItem}>{item}</span>
                  {idx < metadata.length - 1 && <div className={styles.metaDivider} />}
                </React.Fragment>
              ))}
            </div>

            {visibleGenres.length > 0 && (
              <div className={styles.genres}>
                {visibleGenres.map((g) => (
                  <span key={g.name} className={styles.genreTag}>
                    {g.name}
                  </span>
                ))}
              </div>
            )}

            {synopsis && <p className={styles.summary}>{synopsis}</p>}

            <div className={styles.actions}>
              <Button variant="primary" size="md" onClick={handleWatch}>
                Watch Now
              </Button>
            </div>
          </div>

          {top6.length > 1 && (
            <div className={styles.dotRow} onWheel={handleWheel}>
              {top6.map((_, index) => (
                <button
                  key={index}
                  className={index === currentIndex ? styles.activeDot : ''}
                  onClick={() => selectSlide(index)}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SpotlightBanner
