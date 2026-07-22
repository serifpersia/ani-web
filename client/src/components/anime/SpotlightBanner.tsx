import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { FaStar } from 'react-icons/fa'
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

const SpotlightBanner: React.FC<SpotlightBannerProps> = ({ animeList }) => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [autoplayResetKey, setAutoplayResetKey] = useState(0)
  const [lastScrollTime, setLastScrollTime] = useState(0)
  const [isAtTop, setIsAtTop] = useState(
    () => typeof window !== 'undefined' && window.scrollY === 0
  )
  const { lowEndMode } = useLowEndMode()
  const isMobile = useIsMobile()
  const { titlePreference } = useTitlePreference()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const top6 = animeList.slice(0, 6)

  useEffect(() => {
    const items = animeList.slice(0, 6)
    for (const anime of items) {
      if (!anime._id || !/^\d+$/.test(anime._id)) continue
      const existing = queryClient.getQueryData(['show-meta', anime._id])
      if (!existing) {
        queryClient.setQueryData(['show-meta', anime._id], {
          id: anime._id,
          name: anime.name,
          nativeName: anime.nativeName,
          englishName: anime.englishName,
          thumbnail: anime.thumbnail,
          bannerImage: anime.bannerImage,
          description: anime.description,
          genres: anime.genres || [],
          score: anime.score,
          type: anime.type,
          status: anime.status,
          episodeCount: anime.episodeCount,
          isAdult: anime.isAdult,
          names: {
            romaji: anime.name,
            english: anime.englishName || anime.name,
            native: anime.nativeName || anime.name,
          },
        })
      }
    }
  }, [animeList, queryClient])

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

  useEffect(() => {
    const handleScroll = () => {
      setIsAtTop(window.scrollY === 0)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  if (top6.length === 0) return null

  const anime = top6[currentIndex]

  const rawDesc = anime.description ?? ''
  const synopsis = rawDesc.replace(/<[^>]*>?/gm, '').trim()
  const genres = anime.genres ?? []
  const visibleGenres = genres.slice(0, isMobile ? 2 : 4)

  const bannerSrc = anime.bannerImage
    ? fixThumbnailUrl(anime.bannerImage, 1920, 840)
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
    anime.type || 'Anime',
    anime.status,
    anime.episodeCount ? `${anime.episodeCount} Episodes` : undefined,
    anime.rating,
  ].filter(Boolean)

  if (isMobile) return null

  return (
    <div className={`${styles.bannerContainer} ${isAtTop ? styles.bannerAtTop : ''}`}>
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
              {anime.score && (
                <div className={styles.metaRow} style={{ color: '#fbbf24' }}>
                  <FaStar size={14} />
                  <span>{anime.score}</span>
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
                {visibleGenres.map((g) => {
                  const genreName = typeof g === 'string' ? g : g?.name
                  return (
                    <span key={genreName} className={styles.genreTag}>
                      {genreName}
                    </span>
                  )
                })}
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
