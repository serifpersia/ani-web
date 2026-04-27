import fs from 'fs'
import http from 'http'
import https from 'https'
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'
import { pipeline } from 'stream/promises'
import logger from './logger'
import { CONFIG } from './config'

type GoogleTokenSet = {
  access_token?: string
  refresh_token?: string
  scope?: string
  token_type?: string
  expiry_date?: number
  expires_in?: number
}

type GoogleDriveFile = {
  id: string
  name: string
}

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 25 })
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 25 })

httpAgent.setMaxListeners(100)
httpsAgent.setMaxListeners(100)

const googleAxios = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 30000,
})

export class GoogleDriveService {
  private tokens: GoogleTokenSet = {}

  constructor() {
    if (!CONFIG.GOOGLE_CLIENT_ID) {
      logger.error('GOOGLE_CLIENT_ID is missing from .env!')
    }
    this.loadTokens()
  }

  private loadTokens() {
    if (fs.existsSync(CONFIG.TOKEN_PATH)) {
      try {
        this.tokens = JSON.parse(fs.readFileSync(CONFIG.TOKEN_PATH, 'utf-8'))
      } catch (error) {
        logger.error({ err: error }, 'Failed to load Google tokens')
      }
    }
  }

  private saveTokens(tokens: GoogleTokenSet) {
    const merged = { ...this.tokens, ...tokens }
    if (merged.expires_in && !merged.expiry_date) {
      merged.expiry_date = Date.now() + merged.expires_in * 1000
    }
    this.tokens = merged

    try {
      fs.writeFileSync(CONFIG.TOKEN_PATH, JSON.stringify(this.tokens))
    } catch (error) {
      logger.error({ err: error }, 'Failed to save refreshed tokens')
    }
  }

  private getGoogleClientConfig() {
    if (!CONFIG.GOOGLE_CLIENT_ID || !CONFIG.GOOGLE_CLIENT_SECRET) {
      throw new Error('Google OAuth credentials are not configured')
    }

    return {
      clientId: CONFIG.GOOGLE_CLIENT_ID,
      clientSecret: CONFIG.GOOGLE_CLIENT_SECRET,
    }
  }

  private async refreshAccessToken() {
    if (!this.tokens.refresh_token) {
      throw new Error('Missing refresh token')
    }

    const { clientId, clientSecret } = this.getGoogleClientConfig()
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: this.tokens.refresh_token,
      grant_type: 'refresh_token',
    })

    const { data } = await googleAxios.post<GoogleTokenSet>(
      'https://oauth2.googleapis.com/token',
      params.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    )

    this.saveTokens(data)
  }

  private async ensureAccessToken() {
    const expiresSoon = !this.tokens.expiry_date || Date.now() >= this.tokens.expiry_date - 60_000
    if (!this.tokens.access_token || expiresSoon) {
      await this.refreshAccessToken()
    }
  }

  private async googleRequest<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    await this.ensureAccessToken()

    return googleAxios.request<T>({
      ...config,
      headers: {
        Authorization: `Bearer ${this.tokens.access_token}`,
        ...(config.headers ?? {}),
      },
    })
  }

  public isAuthenticated(): boolean {
    return !!this.tokens.refresh_token
  }

  public getAuthUrl(): string {
    const { clientId } = this.getGoogleClientConfig()
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', CONFIG.GOOGLE_REDIRECT_URI)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('prompt', 'consent')
    url.searchParams.set('scope', CONFIG.GOOGLE_SCOPES.join(' '))
    return url.toString()
  }

  public async handleCallback(code: string) {
    const { clientId, clientSecret } = this.getGoogleClientConfig()
    const params = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: CONFIG.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    })

    const { data } = await googleAxios.post<GoogleTokenSet>(
      'https://oauth2.googleapis.com/token',
      params.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    )

    this.saveTokens(data)
    return this.tokens
  }

  public async getUserProfile() {
    if (!this.isAuthenticated()) return null

    try {
      const res = await this.googleRequest({
        method: 'GET',
        url: 'https://www.googleapis.com/oauth2/v2/userinfo',
      })
      return res.data
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch user profile')
      return null
    }
  }

  public async logout() {
    if (fs.existsSync(CONFIG.TOKEN_PATH)) {
      fs.unlinkSync(CONFIG.TOKEN_PATH)
    }
    this.tokens = {}
  }

  public async ensureFolder(folderName: string): Promise<string> {
    if (!this.isAuthenticated()) throw new Error('Not authenticated')

    const existing = await this.findFile(
      folderName,
      undefined,
      'application/vnd.google-apps.folder'
    )
    if (existing) {
      return existing.id
    }

    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }

    try {
      const res = await this.googleRequest<{ id: string }>({
        method: 'POST',
        url: 'https://www.googleapis.com/drive/v3/files',
        params: { fields: 'id' },
        data: fileMetadata,
        headers: { 'Content-Type': 'application/json' },
      })
      return res.data.id!
    } catch (error) {
      logger.error({ err: error }, `Failed to create folder ${folderName}`)
      throw error
    }
  }

  public async findFile(
    filename: string,
    parentId?: string,
    mimeType?: string
  ): Promise<GoogleDriveFile | null> {
    if (!this.isAuthenticated()) return null

    const safeName = filename.replace(/'/g, "\\'")
    let query = `name = '${safeName}' and trashed = false`
    if (parentId) {
      const safeParentId = parentId.replace(/'/g, "\\'")
      query += ` and '${safeParentId}' in parents`
    }
    if (mimeType) {
      const safeMimeType = mimeType.replace(/'/g, "\\'")
      query += ` and mimeType = '${safeMimeType}'`
    }

    try {
      const res = await this.googleRequest<{ files?: GoogleDriveFile[] }>({
        method: 'GET',
        url: 'https://www.googleapis.com/drive/v3/files',
        params: {
          q: query,
          fields: 'files(id, name)',
          spaces: 'drive',
          orderBy: 'createdTime desc',
        },
      })
      if (res.data.files && res.data.files.length > 0) {
        return { id: res.data.files[0].id!, name: res.data.files[0].name! }
      }
      return null
    } catch (error) {
      logger.error({ err: error }, `Failed to find file ${filename}`)
      return null
    }
  }

  public async downloadFile(fileId: string, destPath: string): Promise<void> {
    if (!this.isAuthenticated()) throw new Error('Not authenticated')

    const dest = fs.createWriteStream(destPath)
    try {
      const res = await this.googleRequest<NodeJS.ReadableStream>({
        method: 'GET',
        url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
        params: { alt: 'media' },
        responseType: 'stream',
      })
      await pipeline(res.data, dest)
    } catch (error) {
      dest.destroy()
      throw error
    }
  }

  public async uploadFile(
    filePath: string,
    filename: string,
    mimeType: string = 'application/octet-stream',
    parentId?: string,
    existingFileId?: string
  ) {
    if (!this.isAuthenticated()) throw new Error('Not authenticated')

    let targetId = existingFileId
    if (!targetId) {
      const existing = await this.findFile(filename, parentId, mimeType)
      if (existing) targetId = existing.id
    }

    const media = {
      mimeType,
      body: fs.createReadStream(filePath),
    }

    try {
      if (targetId) {
        await this.googleRequest({
          method: 'PATCH',
          url: `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(targetId)}`,
          params: { uploadType: 'media' },
          data: media.body,
          headers: { 'Content-Type': media.mimeType },
        })
      } else {
        const resource: { name: string; parents?: string[] } = { name: filename }
        if (parentId) {
          resource.parents = [parentId]
        }
        const created = await this.googleRequest<{ id: string }>({
          method: 'POST',
          url: 'https://www.googleapis.com/drive/v3/files',
          params: { fields: 'id' },
          data: resource,
          headers: { 'Content-Type': 'application/json' },
        })

        await this.googleRequest({
          method: 'PATCH',
          url: `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(created.data.id)}`,
          params: { uploadType: 'media' },
          data: media.body,
          headers: { 'Content-Type': media.mimeType },
        })
      }
    } catch (error) {
      logger.error({ err: error }, `Failed to upload file ${filename}`)
      throw error
    }
  }
}

export const googleDriveService = new GoogleDriveService()
