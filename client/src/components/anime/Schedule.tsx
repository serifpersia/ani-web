import React, { useState, useEffect, useRef } from 'react'
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa'
import AnimeCard from './AnimeCard'
import styles from './Schedule.module.css'
import AnimeCardSkeleton from './AnimeCardSkeleton'
import ErrorMessage from '../common/ErrorMessage'

interface Anime {
  _id: string
  id: string
  name: string
  thumbnail: string
  type?: string
  episodeNumber?: number
  currentTime?: number
  duration?: number
  watchedCount?: number
  episodeCount?: number
  availableEpisodesDetail?: {
    sub?: string[]
    dub?: string[]
  }
}

const Schedule: React.FC = () => {
  const [scheduleData, setScheduleData] = useState<Anime[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const carouselRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchEpisodeSchedule = async (date: string) => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/schedule/${date}`)
        if (!response.ok) throw new Error('Failed to fetch episode schedule')
        const data = await response.json()
        setScheduleData(data)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'An unknown error occurred')
        console.error('Error fetching episode schedule:', e)
      } finally {
        setLoading(false)
      }
    }

    fetchEpisodeSchedule(selectedDate)
  }, [selectedDate])

  const scroll = (direction: 'left' | 'right') => {
    if (!carouselRef.current) return
    const { scrollLeft, clientWidth } = carouselRef.current
    const offset = clientWidth * 0.8
    carouselRef.current.scrollTo({
      left: direction === 'left' ? scrollLeft - offset : scrollLeft + offset,
      behavior: 'smooth',
    })
  }

  const getDayButtons = () => {
    const days = []
    const today = new Date()
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    for (let i = -6; i <= 0; i++) {
      const date = new Date()
      date.setDate(today.getDate() + i)
      days.push(date)
    }
    return days.map((date) => {
      const dateString = date.toISOString().split('T')[0]
      let dayLabel = dayNames[date.getDay()]
      if (dateString === today.toISOString().split('T')[0]) {
        dayLabel = 'Today'
      } else {
        const yesterday = new Date()
        yesterday.setDate(today.getDate() - 1)
        if (dateString === yesterday.toISOString().split('T')[0]) {
          dayLabel = 'Yesterday'
        }
      }
      const formattedDate = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      return { dateString, dayLabel, formattedDate }
    })
  }

  return (
    <div className={styles.scheduleSection}>
      <h2 className="section-title">Episode Schedule</h2>

      <div className={styles.daySelector}>
        {getDayButtons().map((dayButton) => (
          <button
            key={dayButton.dateString}
            className={`${styles.dayBtn} ${selectedDate === dayButton.dateString ? styles.active : ''}`}
            onClick={() => setSelectedDate(dayButton.dateString)}
          >
            <span className={styles.dayName}>{dayButton.dayLabel}</span>
            <span className={styles.dayDate}>{dayButton.formattedDate}</span>
          </button>
        ))}
      </div>

      <div className={styles.carouselHeader}>
        {scheduleData.length > 0 && (
          <div className={styles.navArrows}>
            <button
              className={styles.navButton}
              onClick={() => scroll('left')}
              aria-label="Scroll left"
            >
              <FaChevronLeft />
            </button>
            <button
              className={styles.navButton}
              onClick={() => scroll('right')}
              aria-label="Scroll right"
            >
              <FaChevronRight />
            </button>
          </div>
        )}
      </div>

      <div className={styles.carouselContainer}>
        <div className={styles.carousel} ref={carouselRef} key={selectedDate}>
          {loading ? (
            Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className={styles.carouselCard}>
                <AnimeCardSkeleton layout="vertical" />
              </div>
            ))
          ) : error ? (
            <div style={{ width: '100%' }}>
              <ErrorMessage message={error} />
            </div>
          ) : scheduleData.length === 0 ? (
            <p style={{ textAlign: 'center', marginTop: '1rem', width: '100%' }}>
              No episodes scheduled for this day.
            </p>
          ) : (
            scheduleData.map((anime) => (
              <div key={anime._id} className={styles.carouselCard}>
                <AnimeCard
                  key={anime._id}
                  anime={anime}
                  continueWatching={false}
                  layout="vertical"
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default Schedule
