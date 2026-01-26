import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import logger from './logger';
import { CONFIG } from './config';

export class GoogleDriveService {
    private client: OAuth2Client;
    private drive;

    constructor() {
        if (!CONFIG.GOOGLE_CLIENT_ID) {
            logger.error("GOOGLE_CLIENT_ID is missing from .env!");
        }

        this.client = new google.auth.OAuth2(
            CONFIG.GOOGLE_CLIENT_ID,
            CONFIG.GOOGLE_CLIENT_SECRET,
            CONFIG.GOOGLE_REDIRECT_URI
        );

        this.drive = google.drive({ version: 'v3', auth: this.client });
        this.loadTokens();
    }

    private loadTokens() {
        if (fs.existsSync(CONFIG.TOKEN_PATH)) {
            try {
                const tokens = JSON.parse(fs.readFileSync(CONFIG.TOKEN_PATH, 'utf-8'));
                this.client.setCredentials(tokens);
            } catch (error) {
                logger.error({ err: error }, 'Failed to load Google tokens');
            }
        }
    }

    public isAuthenticated(): boolean {
        return !!this.client.credentials && !!this.client.credentials.refresh_token;
    }

    public getAuthUrl(): string {
        return this.client.generateAuthUrl({
            access_type: 'offline',
            scope: CONFIG.GOOGLE_SCOPES,
            prompt: 'consent'
        });
    }

    public async handleCallback(code: string) {
        const { tokens } = await this.client.getToken(code);
        this.client.setCredentials(tokens);
        fs.writeFileSync(CONFIG.TOKEN_PATH, JSON.stringify(tokens));
        return tokens;
    }

    public async getUserProfile() {
        if (!this.isAuthenticated()) return null;
        const oauth2 = google.oauth2({ version: 'v2', auth: this.client });
        try {
            const res = await oauth2.userinfo.get();
            return res.data;
        } catch (error) {
            logger.error({ err: error }, 'Failed to fetch user profile');
            return null;
        }
    }

    public async logout() {
        if (fs.existsSync(CONFIG.TOKEN_PATH)) {
            fs.unlinkSync(CONFIG.TOKEN_PATH);
        }
        this.client.setCredentials({});
    }


    public async ensureFolder(folderName: string): Promise<string> {
        if (!this.isAuthenticated()) throw new Error("Not authenticated");

        const existing = await this.findFile(folderName, undefined, 'application/vnd.google-apps.folder');
        if (existing) {
            return existing.id;
        }

        const fileMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
        };

        try {
            const res = await this.drive.files.create({
                requestBody: fileMetadata,
                fields: 'id',
            });
            return res.data.id!;
        } catch (error) {
            logger.error({ err: error }, `Failed to create folder ${folderName}`);
            throw error;
        }
    }

    public async findFile(filename: string, parentId?: string, mimeType?: string): Promise<{ id: string, name: string } | null> {
        if (!this.isAuthenticated()) return null;

        let query = `name = '${filename}' and trashed = false`;
        if (parentId) {
            query += ` and '${parentId}' in parents`;
        }
        if (mimeType) {
            query += ` and mimeType = '${mimeType}'`;
        }

        try {
            const res = await this.drive.files.list({
                q: query,
                fields: 'files(id, name)',
                                                    spaces: 'drive',
                                                    orderBy: 'createdTime desc'
            });
            if (res.data.files && res.data.files.length > 0) {
                return { id: res.data.files[0].id!, name: res.data.files[0].name! };
            }
            return null;
        } catch (error) {
            logger.error({ err: error }, `Failed to find file ${filename}`);
            return null;
        }
    }

    public async downloadFile(fileId: string, destPath: string): Promise<void> {
        if (!this.isAuthenticated()) throw new Error("Not authenticated");

        const dest = fs.createWriteStream(destPath);
        const res = await this.drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' }
        );

        return new Promise((resolve, reject) => {
            res.data
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .pipe(dest);
        });
    }

    public async uploadFile(filePath: string, filename: string, mimeType: string = 'application/octet-stream', parentId?: string, existingFileId?: string) {
        if (!this.isAuthenticated()) throw new Error("Not authenticated");

        let targetId = existingFileId;
        if (!targetId) {
            const existing = await this.findFile(filename, parentId, mimeType);
            if (existing) targetId = existing.id;
        }

        const media = {
            mimeType,
            body: fs.createReadStream(filePath),
        };

        try {
            if (targetId) {
                await this.drive.files.update({
                    fileId: targetId,
                    media: media,
                });
            } else {
                const resource: { name: string; parents?: string[] } = { name: filename };
                if (parentId) {
                    resource.parents = [parentId];
                }
                await this.drive.files.create({
                    requestBody: resource,
                    media: media,
                    fields: 'id',
                });
            }
        } catch (error) {
            logger.error({ err: error }, `Failed to upload file ${filename}`);
            throw error;
        }
    }
}

export const googleDriveService = new GoogleDriveService();