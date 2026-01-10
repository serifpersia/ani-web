"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rcloneService = void 0;
const child_process_1 = require("child_process");
const logger_1 = __importDefault(require("./logger"));
class RcloneService {
    constructor() {
        this.activeRemote = null;
    }
    executeCommand(command) {
        return new Promise((resolve, reject) => {
            (0, child_process_1.exec)(command, (err, stdout, stderr) => {
                if (err) {
                    if (stderr)
                        logger_1.default.warn({ stderr }, 'Rclone command warning');
                    return reject(new Error(stderr || err.message));
                }
                resolve(stdout.trim());
            });
        });
    }
    executeRcloneArgs(args) {
        return new Promise((resolve, reject) => {
            const process = (0, child_process_1.spawn)('rclone', args, { stdio: 'ignore' });
            process.on('close', (code) => {
                if (code === 0)
                    resolve();
                else
                    reject(new Error(`Rclone exited with code ${code}`));
            });
            process.on('error', (err) => reject(err));
        });
    }
    async init() {
        try {
            await this.executeCommand('rclone version');
            const remotesStr = await this.executeCommand('rclone listremotes');
            const remotes = remotesStr.split('\n').map(r => r.trim());
            const gdriveRemote = remotes.find(r => r.toLowerCase() === 'gdrive:');
            const megaRemote = remotes.find(r => r.toLowerCase() === 'mega:');
            if (megaRemote) {
                this.activeRemote = megaRemote.slice(0, -1);
            }
            else if (gdriveRemote) {
                this.activeRemote = gdriveRemote.slice(0, -1);
            }
            else if (remotes.length > 0) {
                logger_1.default.info({ remotes }, "Rclone initialized but no 'gdrive:' or 'mega:' found.");
                return false;
            }
            else {
                return false;
            }
            return true;
        }
        catch (error) {
            logger_1.default.warn({ err: error }, "Rclone initialization failed");
            return false;
        }
    }
    isActive() {
        return this.activeRemote !== null;
    }
    getRemoteName() {
        return this.activeRemote || 'unknown';
    }
    async downloadFile(remoteFolder, fileName, localPath) {
        if (!this.activeRemote)
            throw new Error("Rclone not active");
        const remotePath = `${this.activeRemote}:${remoteFolder}/${fileName}`;
        await this.executeRcloneArgs(['copyto', remotePath, localPath]);
    }
    async uploadFile(localPath, remoteFolder, fileName) {
        if (!this.activeRemote)
            throw new Error("Rclone not active");
        const remotePath = `${this.activeRemote}:${remoteFolder}/${fileName}`;
        await this.executeRcloneArgs(['copyto', localPath, remotePath]);
    }
    async fileExists(remoteFolder, fileName) {
        if (!this.activeRemote)
            return false;
        try {
            const output = await this.executeCommand(`rclone lsjson "${this.activeRemote}:${remoteFolder}/${fileName}"`);
            const json = JSON.parse(output);
            return json && json.length > 0;
        }
        catch {
            return false;
        }
    }
}
exports.rcloneService = new RcloneService();
