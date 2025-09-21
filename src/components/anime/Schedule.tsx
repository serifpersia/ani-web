import React, { useState, useEffect } from 'react';
import AnimeCard from './AnimeCard';
import styles from './Schedule.module.css';
import AnimeCardSkeleton from './AnimeCardSkeleton';
import ErrorMessage from '../common/ErrorMessage';

interface Anime {
    _id: string;
    id: string;
    name: string;
    thumbnail: string;
    type?: string;
    episodeNumber?: number;
    currentTime?: number;
    duration?: number;
    availableEpisodesDetail?: {
      sub?: string[];
      dub?: string[];
    };
  }

const SkeletonGrid = () => (
    <div className="grid-container">
        {Array.from({ length: 10 }).map((_, i) => <AnimeCardSkeleton key={i} />)}
    </div>
);

const Schedule: React.FC = () => {
  const [scheduleData, setScheduleData] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const fetchEpisodeSchedule = async (date: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/schedule/${date}`);
        if (!response.ok) throw new Error("Failed to fetch episode schedule");
        const data = await response.json();
        setScheduleData(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'An unknown error occurred');
        console.error("Error fetching episode schedule:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchEpisodeSchedule(selectedDate);
  }, [selectedDate]);

  const getDayButtons = () => {
    const days = [];
    const today = new Date();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = -6; i <= 0; i++) {
      const date = new Date();
      date.setDate(today.getDate() + i);
      days.push(date);
    }
    return days.map(date => {
      const dateString = date.toISOString().split('T')[0];
      let dayLabel = dayNames[date.getDay()];
      if (dateString === today.toISOString().split('T')[0]) {
        dayLabel = 'Today';
      } else {
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        if (dateString === yesterday.toISOString().split('T')[0]) {
          dayLabel = 'Yesterday';
        }
      }
      const formattedDate = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return { dateString, dayLabel, formattedDate };
    });
  };

  return (
    <div className={styles.scheduleSection}>
      <h2 className="section-title">Episode Schedule</h2>
      <div className={styles.daySelector}>
        {getDayButtons().map(dayButton => (
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
      {loading ? (
        <SkeletonGrid />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : scheduleData.length === 0 ? (
        <p style={{textAlign: 'center', marginTop: '1rem'}}>No episodes scheduled for this day.</p>
      ) : (
        <div className="grid-container">
          {scheduleData.map(anime => (
            <AnimeCard key={anime._id} anime={anime} continueWatching={false} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Schedule;