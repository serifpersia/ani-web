"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleDriveService = exports.GoogleDriveService = void 0;
const googleapis_1 = require("googleapis");
const fs_1 = __importDefault(require("fs"));
const logger_1 = __importDefault(require("./logger"));
const config_1 = require("./config");
class GoogleDriveService {
    constructor() {
        if (!config_1.CONFIG.GOOGLE_CLIENT_ID) {
            logger_1.default.error("GOOGLE_CLIENT_ID is missing from .env!");
        }
        this.client = new googleapis_1.google.auth.OAuth2(config_1.CONFIG.GOOGLE_CLIENT_ID, config_1.CONFIG.GOOGLE_CLIENT_SECRET, config_1.CONFIG.GOOGLE_REDIRECT_URI);
        this.drive = googleapis_1.google.drive({ version: 'v3', auth: this.client });
        this.loadTokens();
    }
    loadTokens() {
        if (fs_1.default.existsSync(config_1.CONFIG.TOKEN_PATH)) {
            try {
                const tokens = JSON.parse(fs_1.default.readFileSync(config_1.CONFIG.TOKEN_PATH, 'utf-8'));
                this.client.setCredentials(tokens);
            }
            catch (error) {
                logger_1.default.error({ err: error }, 'Failed to load Google tokens');
            }
        }
    }
    isAuthenticated() {
        return !!this.client.credentials && !!this.client.credentials.refresh_token;
    }
    getAuthUrl() {
        return this.client.generateAuthUrl({
            access_type: 'offline',
            scope: config_1.CONFIG.GOOGLE_SCOPES,
            prompt: 'consent'
        });
    }
    async handleCallback(code) {
        const { tokens } = await this.client.getToken(code);
        this.client.setCredentials(tokens);
        fs_1.default.writeFileSync(config_1.CONFIG.TOKEN_PATH, JSON.stringify(tokens));
        return tokens;
    }
    async getUserProfile() {
        if (!this.isAuthenticated())
            return null;
        const oauth2 = googleapis_1.google.oauth2({ version: 'v2', auth: this.client });
        try {
            const res = await oauth2.userinfo.get();
            return res.data;
        }
        catch (error) {
            logger_1.default.error({ err: error }, 'Failed to fetch user profile');
            return null;
        }
    }
    async logout() {
        if (fs_1.default.existsSync(config_1.CONFIG.TOKEN_PATH)) {
            fs_1.default.unlinkSync(config_1.CONFIG.TOKEN_PATH);
        }
        this.client.setCredentials({});
    }
    async ensureFolder(folderName) {
        if (!this.isAuthenticated())
            throw new Error("Not authenticated");
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
            return res.data.id;
        }
        catch (error) {
            logger_1.default.error({ err: error }, `Failed to create folder ${folderName}`);
            throw error;
        }
    }
    async findFile(filename, parentId, mimeType) {
        if (!this.isAuthenticated())
            return null;
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
                return { id: res.data.files[0].id, name: res.data.files[0].name };
            }
            return null;
        }
        catch (error) {
            logger_1.default.error({ err: error }, `Failed to find file ${filename}`);
            return null;
        }
    }
    async downloadFile(fileId, destPath) {
        if (!this.isAuthenticated())
            throw new Error("Not authenticated");
        const dest = fs_1.default.createWriteStream(destPath);
        const res = await this.drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
        return new Promise((resolve, reject) => {
            res.data
                .on('end', () => resolve())
                .on('error', (err) => reject(err))
                .pipe(dest);
        });
    }
    async uploadFile(filePath, filename, mimeType = 'application/octet-stream', parentId, existingFileId) {
        if (!this.isAuthenticated())
            throw new Error("Not authenticated");
        let targetId = existingFileId;
        if (!targetId) {
            const existing = await this.findFile(filename, parentId, mimeType);
            if (existing)
                targetId = existing.id;
        }
        const media = {
            mimeType,
            body: fs_1.default.createReadStream(filePath),
        };
        try {
            if (targetId) {
                await this.drive.files.update({
                    fileId: targetId,
                    media: media,
                });
            }
            else {
                const resource = { name: filename };
                if (parentId) {
                    resource.parents = [parentId];
                }
                await this.drive.files.create({
                    requestBody: resource,
                    media: media,
                    fields: 'id',
                });
            }
        }
        catch (error) {
            logger_1.default.error({ err: error }, `Failed to upload file ${filename}`);
            throw error;
        }
    }
}
exports.GoogleDriveService = GoogleDriveService;
exports.googleDriveService = new GoogleDriveService();
