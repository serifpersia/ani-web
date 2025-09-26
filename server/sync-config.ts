import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

const log = (message: string) => console.log(`[Sync Config] ${new Date().toISOString()} - ${message}`);
const error = (message: string, err?: unknown) => console.error(`[Sync Config] ${new Date().toISOString()} - ${message}`, err);

const CONFIG_FILE_PATH = path.join(__dirname, 'sync.config.json');

interface SyncConfig {
    rootFolderId?: string;
}

let rootFolderId: string | undefined;

async function readConfig(): Promise<SyncConfig> {
    try {
        const content = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
        return JSON.parse(content);
    } catch (e) {
        // File probably doesn't exist, which is fine on first run.
        return {};
    }
}

async function writeConfig(config: SyncConfig): Promise<void> {
    await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(config, null, 2));
}

function fetchAndSaveRootFolderId(): Promise<string | undefined> {
    log('Attempting to fetch and save gdrive:aniweb_db root folder ID for performance...');
    return new Promise((resolve) => {
        const command = 'rclone size gdrive:aniweb_db -vv';
        exec(command, async (err, stdout, stderr) => {
            const output = stderr || stdout;
            const match = output.match(/'root_folder_id = (.*?)'/);
            if (match && match[1]) {
                const folderId = match[1];
                log(`Successfully fetched root folder ID: ${folderId}`);
                rootFolderId = folderId;
                await writeConfig({ rootFolderId: folderId });
                log(`Saved root folder ID to ${CONFIG_FILE_PATH}`);
                resolve(folderId);
            } else {
                error('Could not find root_folder_id in rclone output. Sync may be slower.');
                resolve(undefined);
            }
        });
    });
}

export async function initialize(): Promise<void> {
    if (rootFolderId) {
        return;
    }

    const config = await readConfig();
    if (config.rootFolderId) {
        log(`Using cached root folder ID from ${CONFIG_FILE_PATH}`);
        rootFolderId = config.rootFolderId;
    } else {
        log('No cached root folder ID found. Fetching from rclone...');
        await fetchAndSaveRootFolderId();
    }
}

export function getRemoteString(remoteDir: string): string {
    const RCLONE_REMOTE_NAME = 'gdrive';
    if (rootFolderId && remoteDir === 'aniweb_db') {
        return `${RCLONE_REMOTE_NAME}:{${rootFolderId}}`;
    }
    if (rootFolderId && remoteDir.startsWith('aniweb_db/')) {
        const subPath = remoteDir.substring('aniweb_db'.length);
        return `${RCLONE_REMOTE_NAME}:{${rootFolderId}}${subPath}`;
    }
    return `${RCLONE_REMOTE_NAME}:${remoteDir}`;
}