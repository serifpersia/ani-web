import { Client } from '@xhayper/discord-rpc'
import logger from './logger'
import { CONFIG } from './config'

const log = logger.child({ module: 'DiscordRPC' })

interface DiscordActivityData {
  title: string
  episode: string
  totalEpisodes?: string
  currentTime: number
  duration: number
  thumbnail: string
  isPlaying: boolean
  sessionId?: string
}

class DiscordRPCService {
  private client: Client | null = null
  private isEnabled: boolean = false
  private reconnectTimeout: NodeJS.Timeout | null = null
  private lastActivity: DiscordActivityData | null = null
  private currentSessionId: string | null = null

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled
    if (enabled) {
      this.connect()
    } else {
      this.disconnect()
    }
  }

  private async connect() {
    if (!this.isEnabled || this.client) return

    const clientId = CONFIG.DISCORD_CLIENT_ID
    if (!clientId) {
      log.debug('DISCORD_CLIENT_ID is not configured. Discord Rich Presence is disabled.')
      return
    }

    this.client = new Client({ clientId })

    this.client.on('ready', () => {
      log.info('Connected to Discord client successfully')
      if (this.lastActivity) {
        this.updatePresence(this.lastActivity)
      } else {
        this.clearPresence()
      }
    })

    this.client.on('disconnected', () => {
      log.warn('Disconnected from Discord client, scheduling reconnect...')
      this.cleanup()
      this.scheduleReconnect()
    })

    try {
      await this.client.login()
    } catch (err) {
      log.debug('Discord client not running or login failed. Will retry.')
      this.cleanup()
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) return
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null
      this.connect()
    }, 15000)
  }

  private cleanup() {
    this.client = null
  }

  public disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
    if (this.client) {
      try {
        this.client.destroy()
      } catch (err) {
        log.error({ err }, 'Error destroying Discord RPC')
      }
      this.cleanup()
    }
  }

  private formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds <= 0) return '00:00'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    const mm = String(m).padStart(2, '0')
    const ss = String(s).padStart(2, '0')
    if (h > 0) {
      const hh = String(h).padStart(2, '0')
      return `${hh}:${mm}:${ss}`
    }
    return `${mm}:${ss}`
  }

  public async updatePresence(data: {
    title: string
    episode: string
    totalEpisodes?: string
    currentTime: number
    duration: number
    thumbnail: string
    isPlaying: boolean
    sessionId?: string
  }) {
    this.lastActivity = data
    if (data.sessionId) {
      this.currentSessionId = data.sessionId
    }
    if (!this.isEnabled || !this.client || !this.client.user) return

    try {
      if (!data.isPlaying) {
        await this.client.user.clearActivity()
        await this.client.user.setActivity({
          details: data.title,
          state: `Episode ${data.episode}${data.totalEpisodes ? `/${data.totalEpisodes}` : ''} (Paused)`,
          largeImageKey: data.thumbnail,
          largeImageText: data.title,
          smallImageKey: 'logo',
          smallImageText: 'ani-web',
          type: 3,
          buttons: [
            {
              label: 'Learn More',
              url: 'https://github.com/serifpersia/ani-web',
            },
          ],
        })
        return
      }

      const nowSeconds = Math.round(Date.now() / 1000)
      const startTimestamp = Math.round(nowSeconds - data.currentTime)

      const activity: {
        details: string
        state: string
        startTimestamp: number
        largeImageKey: string
        largeImageText: string
        smallImageKey: string
        smallImageText: string
        type: number
        buttons: { label: string; url: string }[]
        endTimestamp?: number
      } = {
        details: data.title,
        state: `Episode ${data.episode}${data.totalEpisodes ? `/${data.totalEpisodes}` : ''}`,
        startTimestamp: startTimestamp,
        largeImageKey: data.thumbnail,
        largeImageText: data.title,
        smallImageKey: 'logo',
        smallImageText: 'ani-web',
        type: 3,
        buttons: [
          {
            label: 'Learn More',
            url: 'https://github.com/serifpersia/ani-web',
          },
        ],
      }

      if (data.duration && data.duration > 0 && data.duration > data.currentTime) {
        const endTimestamp = Math.round(nowSeconds + (data.duration - data.currentTime))
        activity.endTimestamp = endTimestamp
      }

      await this.client.user.setActivity(activity)
    } catch (err) {
      log.error({ err }, 'Failed to set Discord activity')
    }
  }

  public async setIdleStatus(page: string) {
    if (!this.isEnabled || !this.client || !this.client.user) return

    const pageLabels: Record<string, { details: string; state: string }> = {
      home: { details: 'Browsing Anime', state: 'On the Home page' },
      search: { details: 'Searching for Anime', state: 'Exploring titles...' },
      watchlist: { details: 'Managing Watchlist', state: 'Reviewing anime list' },
      anime: { details: 'Viewing Anime Info', state: 'Reading show details' },
      insights: { details: 'Checking Insights', state: 'Reviewing stats' },
      settings: { details: 'In Settings', state: 'Tweaking preferences' },
      mal: { details: 'MAL Sync', state: 'Syncing with MyAnimeList' },
    }

    const label = pageLabels[page] ?? { details: 'Browsing Anime', state: 'Idle' }

    try {
      await this.client.user.setActivity({
        details: label.details,
        state: label.state,
        largeImageKey: 'logo',
        largeImageText: 'ani-web',
        type: 3,
        buttons: [
          {
            label: 'Learn More',
            url: 'https://github.com/serifpersia/ani-web',
          },
        ],
      })
    } catch (err) {
      log.error({ err }, 'Failed to set Discord idle status')
    }
  }

  public async clearPresence(sessionId?: string) {
    if (sessionId && this.currentSessionId && sessionId !== this.currentSessionId) {
      log.debug(`Ignoring clear request for inactive session: ${sessionId}`)
      return
    }

    this.lastActivity = null
    this.currentSessionId = null

    await this.setIdleStatus('home')
  }
}

export const discordRPCService = new DiscordRPCService()
