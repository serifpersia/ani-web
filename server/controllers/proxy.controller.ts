import { Request, Response } from 'express';
import axios from 'axios';
import path from 'path';

export class ProxyController {
    handleProxy = async (req: Request, res: Response) => {
        const { url, referer } = req.query;
        if (!url) return res.status(400).send('URL required');

        try {
            const headers: Record<string, string> = { 'User-Agent': 'Mozilla/5.0' };
            if (referer) headers['Referer'] = referer as string;
            if (req.headers.range) headers['Range'] = req.headers.range;

            if ((url as string).includes('.m3u8')) {
                const resp = await axios.get(url as string, { headers, responseType: 'text' });
                const baseUrl = new URL(url as string);
                const rewritten = resp.data.split('\n').map((l: string) =>
                    (l.trim() && !l.startsWith('#'))
                        ? `/api/proxy?url=${encodeURIComponent(new URL(l, baseUrl).href)}&referer=${encodeURIComponent(referer as string || '')}`
                        : l
                ).join('\n');
                res.set('Content-Type', 'application/vnd.apple.mpegurl').send(rewritten);
            } else {
                const resp = await axios({ method: 'get', url: url as string, responseType: 'stream', headers });
                res.status(resp.status);
                Object.keys(resp.headers).forEach(k => res.set(k, resp.headers[k]));
                resp.data.pipe(res);
            }
        } catch (e) {
            if (!res.headersSent) res.status(500).send('Proxy error');
        }
    };

    handleSubtitleProxy = async (req: Request, res: Response) => {
        try {
            const response = await axios.get(req.query.url as string, { responseType: 'text', timeout: 10000 });
            res.set('Content-Type', 'text/vtt; charset=utf-8').send(response.data);
        } catch (e) {
            res.status(500).send('Proxy error');
        }
    };

    handleImageProxy = async (req: Request, res: Response) => {
        const { url } = req.query;
        if (!url) return res.status(400).send('URL required');

        try {
            const imageResponse = await axios({
                method: 'get',
                url: url as string,
                responseType: 'arraybuffer',
                headers: {
                    Referer: 'https://allanime.day',
                    'User-Agent': 'Mozilla/5.0'
                }
            });

            res.set('Cache-Control', 'public, max-age=604800, immutable');
            res.set('Content-Type', imageResponse.headers['content-type']);
            res.send(imageResponse.data);
        } catch (e) {
            res.status(200).sendFile(path.join(__dirname, '..', '..', 'public/placeholder.svg'));
        }
    };
}