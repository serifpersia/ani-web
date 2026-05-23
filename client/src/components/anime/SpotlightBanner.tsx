import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { Button } from '../common/Button'
import type { Anime } from '../../hooks/useAnimeData'
import { fixThumbnailUrl } from '../../lib/utils'
import styles from './SpotlightBanner.module.css'
import { useLowEndMode } from '../../contexts/LowEndModeContext'

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
  const { lowEndMode } = useLowEndMode()
  const navigate = useNavigate()
  const top5 = animeList.slice(0, 5)

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % top5.length)
  }, [top5.length])

  useEffect(() => {
    if (top5.length === 0) return
    const timer = setInterval(nextSlide, 10000)
    return () => clearInterval(timer)
  }, [nextSlide, top5.length])

  const metaQueries = useQueries({
    queries: top5.map((anime) => ({
      queryKey: ['spotlight-meta', anime._id],
      queryFn: () => fetchShowMeta(anime._id),
      enabled: !!anime._id,
      staleTime: 1000 * 60 * 10, // 10 min
    })),
  })

  if (top5.length === 0) return null

  const anime = top5[currentIndex]
  const meta: ShowMeta = metaQueries[currentIndex]?.data ?? {}

  const rawDesc = meta.description ?? ''
  const synopsis = rawDesc.replace(/<[^>]*>?/gm, '').trim()
  const genres: { name: string }[] = meta.genres ?? []

  const bannerSrc = meta.bannerImage
    ? fixThumbnailUrl(meta.bannerImage)
    : fixThumbnailUrl(anime.thumbnail, 1280, 450)

  const handleWatch = () => {
    navigate(`/watch/${anime._id}`)
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
          alt={anime.name}
          className={`${styles.posterImage} ${!lowEndMode ? styles.fadeIn : ''}`}
        />
        <div className={styles.overlay}>
          <div className={styles.content}>
            <div className={styles.yearTag}>{new Date().getFullYear()}</div>
            <h2 className={styles.title}>{anime.name}</h2>

            {genres.length > 0 && (
              <div className={styles.genres}>
                {genres.slice(0, 4).map((g) => (
                  <span key={g.name} className={styles.genreTag}>
                    {g.name}
                  </span>
                ))}
              </div>
            )}

            {synopsis && (
              <p className={styles.summary}>
                {synopsis.length > 200 ? synopsis.slice(0, 200) + '…' : synopsis}
              </p>
            )}

            <Button variant="primary" size="lg" onClick={handleWatch}>
              Watch Now
            </Button>
          </div>

          <div className={styles.carouselControls}>
            {top5.map((_, index) => (
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
