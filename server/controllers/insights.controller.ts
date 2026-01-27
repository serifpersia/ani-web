import { Request, Response } from 'express';
import { AllAnimeProvider } from '../providers/allanime.provider';
import logger from '../logger';

export class InsightsController {
    constructor(private provider: AllAnimeProvider) { }

    getWatchInsights = async (req: Request, res: Response) => {
        const db = req.db;

        try {
            
            const coreStatsQuery = `
                SELECT 
                    (SELECT SUM(currentTime) FROM watched_episodes) as totalSeconds,
                    (SELECT COUNT(*) FROM watched_episodes) as totalEpisodes,
                    (SELECT COUNT(*) FROM watchlist WHERE status = 'Completed') as completedCount,
                    (SELECT COUNT(*) FROM watchlist) as totalWatchlist
            `;
            const core: any = await new Promise((resolve, reject) => {
                db.get(coreStatsQuery, (err: any, row: any) => err ? reject(err) : resolve(row || {}));
            });

            
            const activityGridQuery = `
                SELECT date(watchedAt) as day, COUNT(*) as count
                FROM watched_episodes
                WHERE watchedAt >= date('now', '-365 days')
                GROUP BY day
            `;
            const activityGrid: any[] = await new Promise((resolve, reject) => {
                db.all(activityGridQuery, (err: any, rows: any) => err ? reject(err) : resolve(rows || []));
            });

            
            const hourlyDistQuery = `
                SELECT strftime('%H', watchedAt) as hour, COUNT(*) as count
                FROM watched_episodes
                GROUP BY hour
            `;
            const hourlyDist: any[] = await new Promise((resolve, reject) => {
                db.all(hourlyDistQuery, (err: any, rows: any) => err ? reject(err) : resolve(rows || []));
            });

            
            const bingeFactor = activityGrid.length > 0 ? Math.max(...activityGrid.map(a => a.count)) : 0;

            
            const seasonalityQuery = `
                SELECT strftime('%m', watchedAt) as month, SUM(currentTime) as seconds
                FROM watched_episodes
                GROUP BY month
            `;
            const seasonality: any[] = await new Promise((resolve, reject) => {
                db.all(seasonalityQuery, (err: any, rows: any) => err ? reject(err) : resolve(rows || []));
            });

            
            
            const allWatches: any[] = await new Promise((resolve, reject) => {
                db.all("SELECT watchedAt, currentTime FROM watched_episodes ORDER BY watchedAt ASC", (err: any, rows: any) => err ? reject(err) : resolve(rows || []));
            });

            let sessions: number[] = [];
            if (allWatches.length > 0) {
                let currentSessionSeconds = allWatches[0].currentTime;
                for (let i = 1; i < allWatches.length; i++) {
                    const prev = new Date(allWatches[i - 1].watchedAt).getTime();
                    const curr = new Date(allWatches[i].watchedAt).getTime();
                    if (curr - prev < 3600000) { 
                        currentSessionSeconds += allWatches[i].currentTime;
                    } else {
                        sessions.push(currentSessionSeconds);
                        currentSessionSeconds = allWatches[i].currentTime;
                    }
                }
                sessions.push(currentSessionSeconds);
            }
            const avgSessionMinutes = sessions.length > 0 ? Math.round((sessions.reduce((a, b) => a + b, 0) / sessions.length) / 60) : 0;

            
            const watchedShowsQuery = `
                SELECT DISTINCT sm.id, sm.genres, sm.popularityScore
                FROM shows_meta sm
                JOIN watched_episodes we ON sm.id = we.showId
            `;
            const watchedShows: any[] = await new Promise((resolve, reject) => {
                db.all(watchedShowsQuery, (err: any, rows: any) => err ? reject(err) : resolve(rows || []));
            });

            const genreCounts: Record<string, number> = {};
            let totalPopScore = 0;
            let popCount = 0;

            for (const show of watchedShows) {
                let genres: string[] = [];
                if (show.genres) {
                    try { genres = JSON.parse(show.genres); } catch { genres = show.genres.split(',').map((g: string) => g.trim()); }
                }
                genres.forEach(g => genreCounts[g] = (genreCounts[g] || 0) + 1);
                if (show.popularityScore) {
                    totalPopScore += show.popularityScore;
                    popCount++;
                }
            }

            const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
            const personaMap: Record<string, string> = {
                'Action': 'Shonen Warrior',
                'Romance': 'Hopeless Romantic',
                'Comedy': 'Chaos Enjoyer',
                'Slice of Life': 'Vibe Seeker',
                'Horror': 'Fearless Watcher',
                'Fantasy': 'Isekai Traveller',
                'Sci-Fi': 'Future Scientist',
                'Drama': 'Feels Collector'
            };
            const persona = personaMap[topGenre || ''] || 'Anime Enthusiast';

            
            const droppedWarningQuery = `
                SELECT w.id, w.name, MAX(we.watchedAt) as lastActivity
                FROM watchlist w
                JOIN watched_episodes we ON w.id = we.showId
                WHERE w.status = 'Watching'
                GROUP BY w.id
                HAVING lastActivity < date('now', '-90 days')
            `;
            const droppedWarning: any[] = await new Promise((resolve, reject) => {
                db.all(droppedWarningQuery, (err: any, rows: any) => err ? reject(err) : resolve(rows || []));
            });

            
            const velocityQuery = `
                SELECT 
                    (julianday(MAX(we.watchedAt)) - julianday(MIN(we.watchedAt))) as daysToFinish
                FROM watchlist w
                JOIN watched_episodes we ON w.id = we.showId
                WHERE w.status = 'Completed'
                GROUP BY w.id
            `;
            const velocities: any[] = await new Promise((resolve, reject) => {
                db.all(velocityQuery, (err: any, rows: any) => err ? reject(err) : resolve(rows || []));
            });
            const avgCompletionDays = velocities.length > 0 ? Math.round(velocities.reduce((a, b) => a + b.daysToFinish, 0) / velocities.length) : 0;

            res.json({
                totalHours: Math.round((core.totalSeconds || 0) / 3600),
                totalEpisodes: core.totalEpisodes || 0,
                completedAnime: core.completedCount,
                completionRate: core.totalWatchlist > 0 ? Math.round((core.completedCount / core.totalWatchlist) * 100) : 0,
                persona,
                bingeFactor,
                avgSessionMinutes,
                avgCompletionDays,
                popularityScore: popCount > 0 ? Math.round(totalPopScore / popCount) : 0,
                genreSplit: Object.entries(genreCounts)
                    .map(([name, count]) => ({ name, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 8) || [],
                activityGrid: activityGrid || [],
                hourlyDist: Array.from({ length: 24 }, (_, i) => {
                    const hour = i.toString().padStart(2, '0');
                    return { hour, count: hourlyDist?.find(d => d.hour === hour)?.count || 0 };
                }) || [],
                seasonality: Array.from({ length: 12 }, (_, i) => {
                    const month = (i + 1).toString().padStart(2, '0');
                    return { month, seconds: seasonality?.find(s => s.month === month)?.seconds || 0 };
                }) || [],
                droppedShows: (droppedWarning || []).slice(0, 5)
            });

        } catch (error) {
            logger.error({ err: error }, 'Failed to fetch expanded insights');
            res.status(500).json({ error: 'Failed to fetch insights' });
        }
    }
}
