import { Request, Response } from 'express'
import axios from 'axios'
import axiosRetry from 'axios-retry'
import path from 'path'
import http from 'http'
import https from 'https'
import NodeCache from 'node-cache'

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
  handleProxy = async (req: Request, res: Response) => {
    const { url, referer } = req.query
    if (!url) return res.status(400).send('URL required')

    const urlStr = url as string
    const refererStr = (referer as string) || ''
    const cacheKey = `m3u8-${urlStr}-${refererStr}`

    const abortController = new AbortController()
    req.on('close', () => {
      abortController.abort()
    })

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
        const rewritten = resp.data
          .split('\n')
          .map((l: string) => {
            const line = l.trim()
            if (!line) return l

            if (line.startsWith('#')) {
              return line.replace(/URI="([^"]+)"/g, (match, uri) => {
                const fullUri = new URL(uri, baseUrl).href
                return `URI="/api/proxy?url=${encodeURIComponent(fullUri)}&referer=${encodeURIComponent(refererStr)}"`
              })
            }

            const fullUrl = new URL(line, baseUrl).href
            return `/api/proxy?url=${encodeURIComponent(fullUrl)}&referer=${encodeURIComponent(refererStr)}`
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
          if (!res.headersSent) res.status(502).send('Upstream error')
          else res.destroy()
        })
        resp.data.pipe(res)
      }
    } catch (e) {
      if (axios.isCancel(e)) {
        return
      }
      if (!res.headersSent) res.status(500).send('Proxy error')
    }
  }

  handleSubtitleProxy = async (req: Request, res: Response) => {
    const { url, referer } = req.query
    if (!url) return res.status(400).send('URL required')

    try {
      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
      if (referer) headers['Referer'] = referer as string

      const response = await axiosInstance.get(url as string, {
        headers,
        responseType: 'text',
      })
      res.set('Content-Type', 'text/vtt; charset=utf-8').send(response.data)
    } catch (e) {
      res.status(500).send('Proxy error')
    }
  }

  // OPTIMIZED: Use 'stream' instead of 'arraybuffer'
  handleImageProxy = async (req: Request, res: Response) => {
    const { url } = req.query
    if (!url) return res.status(400).send('URL required')

    const abortController = new AbortController()
    req.on('close', () => {
      abortController.abort()
    })

    try {
      const targetUrl = url as string
      let refererValue = 'https://allanime.day'

      if (targetUrl.includes('anilist.co')) {
        refererValue = 'https://anilist.co/'
      } else if (targetUrl.includes('gogocdn.net')) {
        refererValue = 'https://gogoanime.lu/'
      } else if (targetUrl.includes('wp.youtube-anime.com')) {
        refererValue = 'https://allanime.day/'
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

      res.set('Cache-Control', 'public, max-age=604800, immutable')
      res.set('Content-Type', String(imageResponse.headers['content-type'] ?? ''))

      imageResponse.data.on('error', () => {
        if (!res.headersSent) {
          res
            .status(200)
            .sendFile(path.join(__dirname, '..', '..', 'client/public/placeholder.svg'))
        }
      })

      // Pipe directly to response
      imageResponse.data.pipe(res)
    } catch (e) {
      if (axios.isCancel(e)) {
        return
      }
      // Serve placeholder if proxy fails
      res.status(200).sendFile(path.join(__dirname, '..', '..', 'client/public/placeholder.svg'))
    }
  }
}
