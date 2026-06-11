import { Request, Response } from 'express'
import axios from 'axios'
import axiosRetry from 'axios-retry'
import path from 'path'
import http from 'http'
import https from 'https'
import NodeCache from 'node-cache'
import { CONFIG } from '../config'
import fs from 'fs'

const proxyCache = new NodeCache({ stdTTL: 30, checkperiod: 60 })

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 })
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 })

httpAgent.setMaxListeners(100)
httpsAgent.setMaxListeners(100)

export const axiosInstance = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 30000,
})

axiosRetry(axiosInstance, { retries: 3, retryDelay: axiosRetry.exponentialDelay })

export class ProxyController {
  private static readonly KWIK_DOMAINS = new Set(['kwik.cx', 'kwik.si', 'kwik.pro'])
  private static readonly ANIMEPAHE_URL = 'https://animepahe.pw/'

  private abortWhenClientLeaves(res: Response, abortController: AbortController) {
    res.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort()
      }
    })
  }

  private validateKwikUrl(value: unknown): URL | null {
    if (typeof value !== 'string') return null
    try {
      const url = new URL(value)
      const isSecure = url.protocol === 'https:'
      const isKwik = ProxyController.KWIK_DOMAINS.has(url.hostname.toLowerCase())
      const isEmbedPath = /^\/e\/[A-Za-z0-9_-]+$/.test(url.pathname)
      const noAuthOrQuery = !url.username && !url.password && !url.search && !url.hash

      return isSecure && isKwik && isEmbedPath && noAuthOrQuery ? url : null
    } catch {
      return null
    }
  }

  handleProxy = async (req: Request, res: Response) => {
    const { url, referer } = req.query
    if (!url) return res.status(400).send('URL required')

    const urlStr = url as string
    const refererStr = (referer as string) || ''
    const cacheKey = `m3u8-${urlStr}-${refererStr}`

    const abortController = new AbortController()
    this.abortWhenClientLeaves(res, abortController)

    try {
      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
      if (referer) headers['Referer'] = refererStr
      if (req.headers.range) headers['Range'] = req.headers.range

      if (urlStr.includes('.m3u8')) {
        const cached = proxyCache.get<string>(cacheKey)
        if (cached) {
          return res
            .set('Content-Type', 'application/vnd.apple.mpegurl')
            .set('Access-Control-Allow-Origin', '*')
            .send(cached)
        }

        const resp = await axiosInstance.get(urlStr, {
          headers,
          responseType: 'text',
          signal: abortController.signal,
        })

        const baseUrl = new URL(urlStr)
        const proxiedMediaUrl = (targetUrl: string) =>
          `/api/proxy?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(refererStr)}`
        const needsProxy = Boolean(refererStr)

        const rewritten = resp.data
          .split('\n')
          .map((line: string) => {
            const trimmed = line.trim()
            if (!trimmed) return line

            if (trimmed.startsWith('#')) {
              return trimmed.replace(/URI="([^"]+)"/g, (_, uri) => {
                const absolute = new URL(uri, baseUrl).href
                return `URI="${needsProxy || absolute.includes('.m3u8') ? proxiedMediaUrl(absolute) : absolute}"`
              })
            }

            const absolute = new URL(trimmed, baseUrl).href
            return needsProxy || absolute.includes('.m3u8') ? proxiedMediaUrl(absolute) : absolute
          })
          .join('\n')

        proxyCache.set(cacheKey, rewritten)
        res
          .set('Content-Type', 'application/vnd.apple.mpegurl')
          .set('Access-Control-Allow-Origin', '*')
          .send(rewritten)
      } else {
        const resp = await axiosInstance({
          method: 'get',
          url: urlStr,
          responseType: 'stream',
          headers,
          signal: abortController.signal,
        })
        res.status(resp.status)

        const forwardHeaders = [
          'content-type',
          'content-length',
          'content-range',
          'accept-ranges',
          'cache-control',
          'last-modified',
          'etag',
        ]

        Object.keys(resp.headers).forEach((k) => {
          if (forwardHeaders.includes(k.toLowerCase())) {
            res.set(k, resp.headers[k] as string)
          }
        })
        res.set('Access-Control-Allow-Origin', '*')

        resp.data.on('error', () => {
          abortController.abort()
          if (!res.headersSent) res.status(502).send('Upstream error')
          else res.destroy()
        })

        res.on('close', () => {
          if (!resp.data.destroyed) {
            resp.data.destroy()
          }
        })

        resp.data.pipe(res)
      }
    } catch (e) {
      if (axios.isCancel(e)) return
      if (!res.headersSent) res.status(500).send('Proxy error')
    }
  }

  handleEmbedProxy = async (req: Request, res: Response) => {
    const kwikUrl = this.validateKwikUrl(req.query.url)
    if (!kwikUrl) return res.status(400).send('Invalid or unsupported gateway URL')

    const abortController = new AbortController()
    this.abortWhenClientLeaves(res, abortController)

    try {
      const { data: originalHtml } = await axiosInstance.get<string>(kwikUrl.href, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
          Referer: ProxyController.ANIMEPAHE_URL,
          Origin: 'https://animepahe.pw',
        },
        responseType: 'text',
        signal: abortController.signal,
      })

      const patched = this.applyKwikPatches(originalHtml, kwikUrl)
      if (!patched) return res.status(502).send('Failed to patch video gateway')

      return res
        .status(200)
        .set('Content-Type', 'text/html; charset=utf-8')
        .set('Cache-Control', 'private, max-age=120')
        .send(patched)
    } catch (e) {
      if (axios.isCancel(e)) return
      if (!res.headersSent) res.status(502).send('Gateway proxy error')
    }
  }

  private applyKwikPatches(html: string, kwikUrl: URL): string | null {
    const safeReferer = JSON.stringify(kwikUrl.href).replace(/</g, '\\u003c')

    const patched = html.replace(
      /\b(src|href|url)\s*[=:]\s*(["']?)(\/\/[^"'>)]+|\/(?!\/)[^"'>)]*)\2/gi,
      (match, attr, quote, path) => {
        const full = path.startsWith('//') ? `https:${path}` : `${kwikUrl.origin}${path}`
        const prefix = match.startsWith('url') ? `url(` : `${attr}=`
        const suffix = match.startsWith('url') ? `)` : ''
        return `${prefix}${quote}${full}${quote}${suffix}`
      }
    )

    const iconProxy = `/api/proxy?url=${encodeURIComponent(`${kwikUrl.origin}/app/js/vendor/plyr.svg`)}&referer=${encodeURIComponent(kwikUrl.href)}`
    const plyrPatch = `<script>if(window.Plyr) Plyr.defaults.iconUrl=${JSON.stringify(iconProxy).replace(/</g, '\\u003c')};</script>`

    const hlsPatch = `<script>
      (function() {
        var hook = function() {
          if (!window.Hls) return;
          var original = Hls.prototype.loadSource;
          Hls.prototype.loadSource = function(src) {
            if (typeof src === 'string' && src.includes('.m3u8')) {
              src = window.location.origin + '/api/proxy?url=' + encodeURIComponent(src) + '&referer=' + encodeURIComponent(${safeReferer});
            }
            return original.call(this, src);
          };
        };
        if (window.Hls) hook();
        else {
          var observer = new MutationObserver(function() {
            if (window.Hls) { hook(); observer.disconnect(); }
          });
          observer.observe(document.documentElement, { childList: true, subtree: true });
        }
      })();
    </script>`

    const endBridgePatch = `<script>
      (function() {
        var notified = false;
        var notifyEnded = function() {
          if (notified) return;
          notified = true;
          window.parent.postMessage({ type: 'ANI_WEB_MEDIA_ENDED' }, window.location.origin);
        };

        var attachToVideos = function(root) {
          var scope = root || document;
          var videos = scope.querySelectorAll ? scope.querySelectorAll('video') : [];
          Array.prototype.forEach.call(videos, function(video) {
            if (video.dataset && video.dataset.aniWebEndedBridge === 'true') return;
            if (video.dataset) video.dataset.aniWebEndedBridge = 'true';
            video.addEventListener('ended', notifyEnded, { once: true });
          });
        };

        attachToVideos(document);

        var observer = new MutationObserver(function() {
          attachToVideos(document);
        });

        observer.observe(document.documentElement, { childList: true, subtree: true });
      })();
    </script>`

    const beforePlyr = patched.replace(
      /(<script[^>]+\/plyr\.min\.js[^>]*><\/script>)/i,
      `$1${plyrPatch}`
    )
    const final = beforePlyr
      .replace(/(<script[^>]+hls(?:\.min)?\.js[^>]*><\/script>)/i, `$1${hlsPatch}`)
      .replace(/<\/body>/i, `${endBridgePatch}</body>`)

    return final === html ? null : final
  }

  handleSubtitleProxy = async (req: Request, res: Response) => {
    const { url, referer } = req.query
    if (!url) return res.status(400).send('URL required')

    const abortController = new AbortController()
    this.abortWhenClientLeaves(res, abortController)

    try {
      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
      if (referer) headers['Referer'] = referer as string

      const response = await axiosInstance.get(url as string, {
        headers,
        responseType: 'text',
        signal: abortController.signal,
      })
      res.set('Content-Type', 'text/vtt; charset=utf-8').send(response.data)
    } catch (e) {
      if (axios.isCancel(e)) return
      res.status(500).send('Proxy error')
    }
  }

  handleImageProxy = async (req: Request, res: Response) => {
    const { url } = req.query
    if (!url) return res.status(400).send('URL required')

    const abortController = new AbortController()
    this.abortWhenClientLeaves(res, abortController)

    try {
      const targetUrl = url as string
      let refererValue = 'https://allanime.day'

      if (targetUrl.includes('anilist.co')) {
        refererValue = 'https://anilist.co/'
      } else if (targetUrl.includes('gogocdn.net')) {
        refererValue = 'https://gogoanime.lu/'
      } else if (targetUrl.includes('youtube-anime.com') || targetUrl.includes('allanime.day')) {
        refererValue = 'https://allanime.day/'
      } else if (targetUrl.includes('animeya.cc')) {
        refererValue = 'https://animeya.cc/'
      }

      const imageResponse = await axiosInstance({
        method: 'get',
        url: targetUrl,
        responseType: 'stream',
        headers: {
          Referer: refererValue,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 30000,
        signal: abortController.signal,
      })

      if (imageResponse.status === 200) {
        res.set('Cache-Control', 'public, max-age=604800, immutable')
      }
      res.set('Content-Type', String(imageResponse.headers['content-type'] ?? ''))

      imageResponse.data.on('error', () => {
        if (!res.headersSent) {
          this.sendPlaceholder(res)
        }
      })

      res.on('close', () => {
        if (!imageResponse.data.destroyed) {
          imageResponse.data.destroy()
        }
      })

      imageResponse.data.pipe(res)
    } catch (e) {
      if (axios.isCancel(e)) {
        return
      }
      if (!res.headersSent) {
        this.sendPlaceholder(res)
      }
    }
  }

  private sendPlaceholder(res: Response) {
    const possiblePaths = [
      path.join(CONFIG.PACKAGE_ROOT, 'client/public/placeholder.svg'),
      path.join(CONFIG.PACKAGE_ROOT, 'client/dist/placeholder.svg'),
      path.join(CONFIG.SERVER_ROOT, '..', 'client/public/placeholder.svg'),
    ]

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return res.sendFile(p, (err) => {
          if (err && !res.headersSent) {
            res.status(404).send('Not Found')
          }
        })
      }
    }

    res.status(404).send('Not Found')
  }
}
