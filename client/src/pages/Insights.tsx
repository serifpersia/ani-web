import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FaClock, FaCheckCircle, FaLayerGroup, FaFire, FaUserAstronaut, FaHistory, FaExclamationTriangle } from 'react-icons/fa';
import styles from './Insights.module.css';

interface GenreStat {
    name: string;
    count: number;
}

interface ActivityDay {
    day: string;
    count: number;
}

interface HourlyStat {
    hour: string;
    count: number;
}

interface SeasonalStat {
    month: string;
    seconds: number;
}

interface DroppedShow {
    id: string;
    name: string;
    lastActivity: string;
}

interface InsightData {
    totalHours: number;
    totalEpisodes: number;
    completedAnime: number;
    completionRate: number;
    persona: string;
    bingeFactor: number;
    avgSessionMinutes: number;
    avgCompletionDays: number;
    popularityScore: number;
    genreSplit: GenreStat[];
    activityGrid: ActivityDay[];
    hourlyDist: HourlyStat[];
    seasonality: SeasonalStat[];
    droppedShows: DroppedShow[];
}

const Insights: React.FC = () => {
    const { data, isLoading, isError } = useQuery<InsightData>({
        queryKey: ['insights'],
        queryFn: async () => {
            const res = await fetch('/api/insights');
            if (!res.ok) throw new Error('Failed to fetch insights');
            return res.json();
        },
    });

    const heatmapData = useMemo(() => {
        if (!data?.activityGrid) return [];
        const daysMap = new Map(data.activityGrid.map(d => [d.day, d.count]));
        const result = [];
        const today = new Date();
        for (let i = 364; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            result.push({ date: dateStr, count: daysMap.get(dateStr) || 0 });
        }
        return result;
    }, [data]);

    const maxSeasonal = useMemo(() => {
        if (!data?.seasonality?.length) return 0;
        return Math.max(...data.seasonality.map(s => s.seconds), 1);
    }, [data]);

    const maxHourly = useMemo(() => {
        if (!data?.hourlyDist?.length) return 0;
        return Math.max(...data.hourlyDist.map(h => h.count), 1);
    }, [data]);

    if (isLoading) return <div className={styles.loading}>Analyzing your anime lifestyle...</div>;
    if (isError) return <div className={styles.error}>Could not load insights. Data might be syncing.</div>;
    if (!data) return null;

    return (
        <div className="page-container">
            <div className={styles.header}>
                <h2 className="section-title">Watch Insights</h2>
                <div className={styles.personaBadge}>
                    <FaUserAstronaut />
                    <div className={styles.personaInfo}>
                        <span className={styles.personaLabel}>Your Persona</span>
                        <span className={styles.personaValue}>{data.persona}</span>
                    </div>
                </div>
            </div>

            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon} style={{ background: 'rgba(138, 79, 255, 0.2)', color: 'var(--accent)' }}>
                        <FaClock />
                    </div>
                    <div className={styles.statInfo}>
                        <span className={styles.statValue}>{data.totalHours}h</span>
                        <span className={styles.statLabel}>Watch Time</span>
                    </div>
                </div>

                <div className={styles.statCard}>
                    <div className={styles.statIcon} style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' }}>
                        <FaCheckCircle />
                    </div>
                    <div className={styles.statInfo}>
                        <span className={styles.statValue}>{data.completionRate}%</span>
                        <span className={styles.statLabel}>Completion Rate</span>
                    </div>
                </div>

                <div className={styles.statCard}>
                    <div className={styles.statIcon} style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}>
                        <FaFire />
                    </div>
                    <div className={styles.statInfo}>
                        <span className={styles.statValue}>{data.bingeFactor}</span>
                        <span className={styles.statLabel}>Max Daily Binge</span>
                    </div>
                </div>

                <div className={styles.statCard}>
                    <div className={styles.statIcon} style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' }}>
                        <FaHistory />
                    </div>
                    <div className={styles.statInfo}>
                        <span className={styles.statValue}>{data.avgSessionMinutes}m</span>
                        <span className={styles.statLabel}>Avg. Session</span>
                    </div>
                </div>

                <div className={styles.statCard}>
                    <div className={styles.statIcon} style={{ background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24' }}>
                        <FaLayerGroup />
                    </div>
                    <div className={styles.statInfo}>
                        <span className={styles.statValue}>{data.avgCompletionDays}d</span>
                        <span className={styles.statLabel}>Avg. Speed</span>
                    </div>
                </div>
            </div>

            <div className={styles.wideSection}>
                <div className={styles.sectionHeader}>
                    <h3>Activity</h3>
                    <div className={styles.heatLegend}>
                        <span>Less</span>
                        <div className={`${styles.heatBox} ${styles.level0}`} />
                        <div className={`${styles.heatBox} ${styles.level1}`} />
                        <div className={`${styles.heatBox} ${styles.level2}`} />
                        <div className={`${styles.heatBox} ${styles.level3}`} />
                        <div className={`${styles.heatBox} ${styles.level4}`} />
                        <span>More</span>
                    </div>
                </div>
                <div className={styles.heatmapWrapper}>
                    <div className={styles.heatmapMonthLabels}>
                        {(() => {
                            const labels: React.ReactElement[] = [];
                            let lastMonth = -1;
                            heatmapData.forEach((d, i) => {
                                const date = new Date(d.date);
                                const month = date.getMonth();
                                if (month !== lastMonth && i % 7 === 0) {
                                    labels.push(
                                        <span key={i} style={{ gridColumn: Math.floor(i / 7) + 1 }}>
                                            {date.toLocaleString('default', { month: 'short' })}
                                        </span>
                                    );
                                    lastMonth = month;
                                }
                            });
                            return labels;
                        })()}
                    </div>
                    <div className={styles.heatmapGrid}>
                        {heatmapData.map((d, i) => {
                            let level = 0;
                            if (d.count > 0) level = 1;
                            if (d.count > 2) level = 2;
                            if (d.count > 5) level = 3;
                            if (d.count > 10) level = 4;
                            return (
                                <div
                                    key={i}
                                    className={`${styles.heatBox} ${styles[`level${level}`]}`}
                                    title={`${d.count} episodes on ${d.date}`}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className={styles.chartsContainer}>
                <div className={styles.chartWrapper}>
                    <h3>Time Distribution (24h)</h3>
                    <div className={styles.hourlyChart}>
                        {data.hourlyDist?.map((h, i) => (
                            <div key={i} className={styles.hourlyBarContainer}>
                                <div
                                    className={styles.hourlyBar}
                                    style={{ height: `${(h.count / maxHourly) * 100 || 2}%` }}
                                    title={`${h.count} watches at ${h.hour}:00`}
                                />
                                {i % 4 === 0 && <span className={styles.hourlyLabel}>{h.hour}</span>}
                            </div>
                        ))}
                    </div>
                    <div className={styles.chartSubtext}>
                        {(() => {
                            if (!data.hourlyDist?.length) {
                                return "Watch more to see your peak hours!";
                            }
                            const peakHour = parseInt([...data.hourlyDist].sort((a, b) => b.count - a.count)[0].hour);
                            return (peakHour >= 6 && peakHour < 19)
                                ? "You prefer daytime watching ☀️"
                                : "You're a confirmed Night Owl 🦉";
                        })()}
                    </div>
                </div>
                <div className={styles.chartWrapper}>
                    <h3>Popularity Bias</h3>
                    <div className={styles.popScale}>
                        <div className={styles.popTrack}>
                            <div
                                className={styles.popThumb}
                                style={{ left: `${Math.max(0, Math.min(100, data.popularityScore))}%` }}
                            />
                        </div>
                        <div className={styles.popLabels}>
                            <span>Mainstream</span>
                            <span>Underground</span>
                        </div>
                    </div>
                    <p className={styles.popDescription}>
                        Your taste score is <strong>{data.popularityScore}</strong>.
                        {data.popularityScore < 50 ? " You follow the big hits!" : " You're a connoisseur of the obscure!"}
                    </p>
                </div>
                <div className={styles.chartWrapper}>
                    <h3>Monthly Activity</h3>
                    <div className={styles.seasonalChart}>
                        {data.seasonality?.map((s, i) => (
                            <div key={i} className={styles.seasonalBarContainer}>
                                <div
                                    className={styles.seasonalBar}
                                    style={{ height: `${(s.seconds / maxSeasonal) * 100 || 5}%` }}
                                    title={`${Math.round(s.seconds / 3600)}h in ${new Date(0, i).toLocaleString('default', { month: 'long' })}`}
                                />
                                <span className={styles.seasonalLabel}>{new Date(0, i).toLocaleString('default', { month: 'short' })}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className={styles.chartWrapper}>
                    <h3>Genre Dominance</h3>
                    <div className={styles.genreList}>
                        {data.genreSplit?.map((g, i) => (
                            <div key={i} className={styles.genreRow}>
                                <div className={styles.genreInfo}>
                                    <span className={styles.genreName}>{g.name}</span>
                                    <span className={styles.genreCount}>{g.count} titles</span>
                                </div>
                                <div className={styles.genreBarBg}>
                                    <div
                                        className={styles.genreBar}
                                        style={{
                                            width: `${(g.count / (data.genreSplit[0]?.count || 1)) * 100}%`,
                                            backgroundColor: `hsl(${265 - (i * 15)}, 70%, 65%)`
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            {data.droppedShows?.length > 0 && (
                <div className={styles.warningSection}>
                    <div className={styles.warningHeader}>
                        <FaExclamationTriangle />
                        <h3>Dusty Watchlist (Inactive 90+ days)</h3>
                    </div>
                    <div className={styles.droppedGrid}>
                        {data.droppedShows.map(show => (
                            <div key={show.id} className={styles.droppedCard}>
                                <span className={styles.droppedName}>{show.name}</span>
                                <span className={styles.droppedDate}>Last watched: {new Date(show.lastActivity).toLocaleDateString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Insights;
