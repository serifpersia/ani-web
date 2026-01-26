import { Request, Response } from 'express';
import logger from '../logger';
import { AllAnimeProvider } from '../providers/allanime.provider';
import { performWriteTransaction } from '../sync';

interface WatchedEpisode {
    episodeNumber: string;
    currentTime: number;
    duration: number;
}

interface ContinueWatchingShow {
    _id: string;
    id: string;
    name: string;
    thumbnail?: string;
    nativeName?: string;
    englishName?: string;
    episodeNumber: string;
    currentTime: number;
    duration: number;
}

interface WatchingShow {
    id: string;
    name: string;
    thumbnail?: string;
    nativeName?: string;
    englishName?: string;
    lastWatchedAt: string | null;
}

interface CombinedContinueWatchingShow {
    _id: string;
    id: string;
    name: string;
    thumbnail?: string;
    nativeName?: string;
    englishName?: string;
    episodeNumber?: string | number;
    currentTime?: number;
    duration?: number;
    nextEpisodeToWatch?: string;
    newEpisodesCount?: number;
}

export class WatchlistController {
    constructor(private provider: AllAnimeProvider) { }

    private async getContinueWatchingData(db: any): Promise<{ data: CombinedContinueWatchingShow[], total: number }> {
        const inProgressQuery = `
        SELECT
        sm.id as _id, sm.id, sm.name, sm.thumbnail, sm.nativeName, sm.englishName,
        we.episodeNumber, we.currentTime, we.duration
        FROM shows_meta sm
        JOIN (
            SELECT *, ROW_NUMBER() OVER(PARTITION BY showId ORDER BY watchedAt DESC) as rn
            FROM watched_episodes
            WHERE (currentTime / duration) BETWEEN 0.05 AND 0.95
        ) we ON sm.id = we.showId
        WHERE we.rn = 1
        ORDER BY we.watchedAt DESC;
        `;
        const inProgressShows: ContinueWatchingShow[] = await new Promise((resolve, reject) => {
            db.all(inProgressQuery, [], (err: any, rows: ContinueWatchingShow[]) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        const watchingShowsQuery = `
        SELECT
        w.id, w.name, w.thumbnail, w.nativeName, w.englishName,
        (SELECT MAX(we.watchedAt) FROM watched_episodes we WHERE we.showId = w.id) as lastWatchedAt
        FROM watchlist w
        WHERE w.status = 'Watching'
        ORDER BY lastWatchedAt DESC;
        `;
        const watchingShows: WatchingShow[] = await new Promise((resolve, reject) => {
            db.all(watchingShowsQuery, [], (err: any, rows: WatchingShow[]) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        const upNextShows: CombinedContinueWatchingShow[] = [];
        const fullyWatchedShows: CombinedContinueWatchingShow[] = [];

        for (const show of watchingShows) {
            try {
                const [epDetails, watchedEpisodesResult] = await Promise.all([
                    this.provider.getEpisodes(show.id, 'sub'),
                    new Promise<WatchedEpisode[]>((resolve, reject) => {
                        db.all('SELECT * FROM watched_episodes WHERE showId = ?', [show.id], (err: any, rows: WatchedEpisode[]) => {
                            if (err) reject(err);
                            else resolve(rows);
                        });
                    })
                ]);

                const allEps = epDetails?.episodes?.sort((a, b) => parseFloat(a) - parseFloat(b)) || [];
                const watchedEpsMap = new Map(watchedEpisodesResult.map(r => [r.episodeNumber.toString(), r]));

                const unwatchedEps = allEps.filter(ep => !watchedEpsMap.has(ep));

                if (unwatchedEps.length > 0) {
                    upNextShows.push({
                        _id: show.id,
                        id: show.id,
                        name: show.name,
                        thumbnail: show.thumbnail,
                        nativeName: show.nativeName,
                        englishName: show.englishName,
                        nextEpisodeToWatch: unwatchedEps[0],
                        newEpisodesCount: unwatchedEps.length,
                    });
                } else if (watchedEpsMap.size > 0) {
                    const lastWatchedEpisodeNumber = Math.max(...Array.from(watchedEpsMap.keys()).map(e => parseFloat(e as string)));
                    const lastWatchedEpisodeDetails = watchedEpsMap.get(lastWatchedEpisodeNumber.toString());

                    if (lastWatchedEpisodeDetails) {
                        fullyWatchedShows.push({
                            _id: show.id,
                            id: show.id,
                            name: show.name,
                            thumbnail: show.thumbnail,
                            nativeName: show.nativeName,
                            englishName: show.englishName,
                            episodeNumber: lastWatchedEpisodeNumber,
                            currentTime: lastWatchedEpisodeDetails.currentTime,
                            duration: lastWatchedEpisodeDetails.duration,
                        });
                    }
                }
            } catch (e) {
                logger.error({ err: e, showId: show.id }, 'Error processing show for Up Next list');
            }
        }

        const combinedList: CombinedContinueWatchingShow[] = [];
        const seenShowIds = new Set<string>();

        for (const show of upNextShows) {
            if (!seenShowIds.has(show.id)) {
                combinedList.push({
                    ...show,
                    thumbnail: this.provider.deobfuscateUrl(show.thumbnail ?? '')
                });
                seenShowIds.add(show.id);
            }
        }

        for (const show of inProgressShows) {
            if (!seenShowIds.has(show.id)) {
                combinedList.push({
                    ...show,
                    thumbnail: this.provider.deobfuscateUrl(show.thumbnail ?? '')
                });
                seenShowIds.add(show.id);
            }
        }

        for (const show of fullyWatchedShows) {
            if (!seenShowIds.has(show.id)) {
                combinedList.push({
                    ...show,
                    thumbnail: this.provider.deobfuscateUrl(show.thumbnail ?? '')
                });
                seenShowIds.add(show.id);
            }
        }

        return { data: combinedList, total: combinedList.length };
    }

    getContinueWatching = async (req: Request, res: Response) => {
        try {
            const data = await this.getContinueWatchingData(req.db);
            res.json(data.data.slice(0, 10));
        } catch {
            res.status(500).json({ error: 'DB error' });
        }
    };

    getAllContinueWatching = async (req: Request, res: Response) => {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 10;
            const offset = (page - 1) * limit;
            const { data: allData, total } = await this.getContinueWatchingData(req.db);

            res.json({
                data: allData.slice(offset, offset + limit),
                total,
                page,
                limit
            });
        } catch {
            res.status(500).json({ error: 'DB error' });
        }
    };

    updateProgress = async (req: Request, res: Response) => {
        const { showId, episodeNumber, currentTime, duration, showName, showThumbnail, nativeName, englishName } = req.body;
        try {
            await performWriteTransaction(req.db, (tx) => {
                tx.run('INSERT OR IGNORE INTO shows_meta (id, name, thumbnail, nativeName, englishName) VALUES (?, ?, ?, ?, ?)',
                    [showId, showName, this.provider.deobfuscateUrl(showThumbnail), nativeName, englishName]);
                tx.run(`INSERT OR REPLACE INTO watched_episodes (showId, episodeNumber, watchedAt, currentTime, duration) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)`,
                    [showId, episodeNumber, currentTime, duration]);
            });
            res.json({ success: true });
        } catch (error) {
            logger.error({ err: error }, 'Update progress failed');
            res.status(500).json({ error: 'DB error' });
        }
    };

    removeContinueWatching = async (req: Request, res: Response) => {
        const { showId } = req.body;
        try {
            await performWriteTransaction(req.db, (tx) => {
                tx.run('DELETE FROM watched_episodes WHERE showId = ?', [showId]);
            });
            res.json({ success: true });
        } catch {
            res.status(500).json({ error: 'DB error' });
        }
    };

    getWatchlist = (req: Request, res: Response) => {
        const { status, page: pageStr, limit: limitStr } = req.query;
        const page = parseInt(pageStr as string) || 1;
        const limit = parseInt(limitStr as string) || 10;
        const offset = (page - 1) * limit;

        let query = 'SELECT * FROM watchlist';
        let countQuery = 'SELECT COUNT(*) as total FROM watchlist';
        const params: (string | number)[] = [];

        if (status && status !== 'All') {
            query += ' WHERE status = ?';
            countQuery += ' WHERE status = ?';
            params.push(status as string);
        }

        query += ' ORDER BY rowid DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        req.db.all(query, params, (err: any, rows: any[]) => {
            if (err) return res.status(500).json({ error: 'DB error', details: err.message });

            req.db.get(countQuery, params.slice(0, -2), (countErr: any, countRow: { total: number }) => {
                if (countErr) return res.status(500).json({ error: 'DB error', details: countErr.message });
                res.json({
                    data: rows.map(row => ({ ...row, _id: row.id })),
                    total: countRow.total,
                    page,
                    limit
                });
            });
        });
    };

    checkWatchlist = (req: Request, res: Response) => {
        req.db.get('SELECT EXISTS(SELECT 1 FROM watchlist WHERE id = ?) as inWatchlist',
            [req.params.showId], (err: any, row: { inWatchlist: number }) => res.json({ inWatchlist: !!row.inWatchlist }));
    };

    getEpisodeProgress = (req: Request, res: Response) => {
        req.db.get('SELECT currentTime, duration FROM watched_episodes WHERE showId = ? AND episodeNumber = ?',
            [req.params.showId, req.params.episodeNumber], (err: any, row: any) => res.json(row || { currentTime: 0, duration: 0 }));
    };

    getWatchedEpisodes = (req: Request, res: Response) => {
        req.db.all(`SELECT episodeNumber FROM watched_episodes WHERE showId = ?`,
            [req.params.showId], (err: any, rows: { episodeNumber: string }[]) => res.json(rows ? rows.map(r => r.episodeNumber) : []));
    };

    addToWatchlist = async (req: Request, res: Response) => {
        const { id, name, thumbnail, status, nativeName, englishName } = req.body;
        try {
            await performWriteTransaction(req.db, (tx) => {
                tx.run('INSERT OR REPLACE INTO watchlist (id, name, thumbnail, status, nativeName, englishName) VALUES (?, ?, ?, ?, ?, ?)',
                    [id, name, this.provider.deobfuscateUrl(thumbnail), status || 'Watching', nativeName, englishName]);
            });
            res.json({ success: true });
        } catch {
            res.status(500).json({ error: 'DB error' });
        }
    };

    removeFromWatchlist = async (req: Request, res: Response) => {
        const { id } = req.body;
        try {
            await performWriteTransaction(req.db, (tx) => {
                tx.run('DELETE FROM watchlist WHERE id = ?', [id]);
            });
            res.json({ success: true });
        } catch {
            res.status(500).json({ error: 'DB error' });
        }
    };

    updateWatchlistStatus = async (req: Request, res: Response) => {
        const { id, status } = req.body;
        try {
            await performWriteTransaction(req.db, (tx) => {
                tx.run('UPDATE watchlist SET status = ? WHERE id = ?', [status, id]);
            });
            res.json({ success: true });
        } catch {
            res.status(500).json({ error: 'DB error' });
        }
    };
}