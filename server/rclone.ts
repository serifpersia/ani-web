import { spawn, exec } from 'child_process';
import logger from './logger';
import { CONFIG } from './config';

class RcloneService {
    private activeRemote: string | null = null;

    private executeCommand(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            exec(command, (err, stdout, stderr) => {
                if (err) {
                    if (stderr) logger.warn({ stderr }, 'Rclone command warning');
                    return reject(new Error(stderr || err.message));
                }
                resolve(stdout.trim());
            });
        });
    }

    private executeRcloneArgs(args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const process = spawn('rclone', args, { stdio: 'ignore' });
            process.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Rclone exited with code ${code}`));
            });
            process.on('error', (err) => reject(err));
        });
    }

    public async init(): Promise<boolean> {
        try {
            await this.executeCommand('rclone version');

            const remotesStr = await this.executeCommand('rclone listremotes');
            const remotes = remotesStr.split('\n').map(r => r.trim());

            const gdriveRemote = remotes.find(r => r.toLowerCase() === 'gdrive:');
            const megaRemote = remotes.find(r => r.toLowerCase() === 'mega:');

            if (megaRemote) {
                this.activeRemote = megaRemote.slice(0, -1);
            } else if (gdriveRemote) {
                this.activeRemote = gdriveRemote.slice(0, -1);
            } else if (remotes.length > 0) {
                logger.info({ remotes }, "Rclone initialized but no 'gdrive:' or 'mega:' found.");
                return false;
            } else {
                return false;
            }
            return true;
        } catch (error) {
            logger.warn({ err: error }, "Rclone initialization failed");
            return false;
        }
    }

    public isActive(): boolean {
        return this.activeRemote !== null;
    }

    public getRemoteName(): string {
        return this.activeRemote || 'unknown';
    }

    public async downloadFile(remoteFolder: string, fileName: string, localPath: string): Promise<void> {
        if (!this.activeRemote) throw new Error("Rclone not active");
        const remotePath = `${this.activeRemote}:${remoteFolder}/${fileName}`;
        await this.executeRcloneArgs(['copyto', remotePath, localPath]);
    }

    public async uploadFile(localPath: string, remoteFolder: string, fileName: string): Promise<void> {
        if (!this.activeRemote) throw new Error("Rclone not active");
        const remotePath = `${this.activeRemote}:${remoteFolder}/${fileName}`;
        await this.executeRcloneArgs(['copyto', localPath, remotePath]);
    }

    public async fileExists(remoteFolder: string, fileName: string): Promise<boolean> {
        if (!this.activeRemote) return false;
        try {
            const output = await this.executeCommand(`rclone lsjson "${this.activeRemote}:${remoteFolder}/${fileName}"`);
            const json = JSON.parse(output);
            return json && json.length > 0;
        } catch {
            return false;
        }
    }
}

export const rcloneService = new RcloneService();
