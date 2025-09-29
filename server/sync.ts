import { spawn, exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Database } from 'sqlite3';
import sqlite3 from 'sqlite3';
import { initialize as initializeSyncConfig, getRemoteString, setActiveRemote } from './sync-config';
import logger from './logger';

const log = logger.child({ module: 'Sync' });

// --- CONFIGURATION ---
const TEMP_MANIFEST_PATH = path.join(__dirname, 'sync_manifest.temp.json');

function executeCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(command, (err, stdout, stderr) => {
            if (err) {
                return reject(new Error(stderr || err.message));
            }
            resolve(stdout);
        });
    });
}

function executeRclone(args: string[]): Promise<void> {
    const argsWithProgress = [...args, '--progress'];
    log.info(`Executing: rclone ${argsWithProgress.join(' ')}`);

    return new Promise((resolve, reject) => {
        const rcloneProcess = spawn('rclone', argsWithProgress, {
            stdio: 'pipe'
        });

        rcloneProcess.stdout.pipe(process.stdout);
        rcloneProcess.stderr.pipe(process.stderr);

        rcloneProcess.on('close', (code) => {
            process.stdout.write('\n');
            if (code === 0) {
                log.info(`Rclone process finished successfully.`);
                resolve();
            } else {
                log.error(`Rclone process exited with code ${code}`);
                reject(new Error(`Rclone process exited with code ${code}`));
            }
        });

        rcloneProcess.on('error', (err) => {
            log.error({ err }, 'Failed to start rclone process.');
            reject(err);
        });
    });
}

export async function verifyRclone(): Promise<boolean> {
    log.info('Verifying rclone setup...');
    try {
        await executeCommand('rclone version');
    } catch (err: unknown) {
        const errorMessage = (err as Error).message;
        if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
            console.error('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
            console.error('!! [Sync Error] rclone is not installed or not in your system\'s PATH.');
            console.error('!! Please install rclone from https://rclone.org/downloads/ and ensure it is accessible.');
            console.error('!! The automatic sync system will be disabled.');
            console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
            return false;
        }
        log.error({ err }, 'An unexpected error occurred while checking rclone version.');
        return false;
    }

    try {
        const remotes = await executeCommand('rclone listremotes');
        
        if (remotes.includes('mega:')) {
            log.info('Found "mega" remote.');
            setActiveRemote('mega');
        } else if (remotes.includes('gdrive:')) {
            log.info('Found "gdrive" remote. Using as fallback.');
            setActiveRemote('gdrive');
        } else {
            console.error('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
            console.error(`!! [Sync Error] Neither 'mega' nor 'gdrive' remote is configured.`);
            console.error('!! Please run `rclone config` to set up at least one of them.');
            console.error('!! The automatic sync system will be disabled.');
            console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
            return false;
        }

    } catch (err) {
        log.error({ err }, 'An unexpected error occurred while listing rclone remotes.');
        return false;
    }

    log.info('Rclone setup verified successfully.');
    await initializeSyncConfig();
    return true;
}

export async function getRemoteVersion(remoteDir: string): Promise<number> {
    log.info('Fetching remote manifest...');
    try {
        await executeRclone(['copyto', `${getRemoteString(remoteDir)}/sync_manifest.json`, TEMP_MANIFEST_PATH]);
        const manifestContent = await fs.readFile(TEMP_MANIFEST_PATH, 'utf-8');
        await fs.unlink(TEMP_MANIFEST_PATH);
        const manifest = JSON.parse(manifestContent);
        const version = manifest.version || 0;
        log.info(`Remote manifest found. Version: ${version}`);
        return version;
    } catch (err) {
        log.warn('Could not fetch remote manifest. Assuming version 0.');
        return 0;
    }
}

export async function getLocalVersion(db: Database): Promise<number> {
    log.info('Getting local DB version...');
    return new Promise((resolve, reject) => {
        db.get('SELECT value FROM sync_metadata WHERE key = ?', ['db_version'], (err, row: { value: number }) => {
            if (err) {
                log.error({ err }, 'Failed to get local DB version.');
                return reject(err);
            }
            const version = row ? row.value : 0;
            log.info(`Local DB version is: ${version}`);
            resolve(version);
        });
    });
}

export async function performWriteTransaction(db: Database, runnable: (tx: Database) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            runnable(db);
            db.run('UPDATE sync_metadata SET value = value + 1 WHERE key = "db_version"');
            db.run('COMMIT', (err: Error | null) => {
                if (err) {
                    log.error({ err }, 'Transaction failed. Rolling back.');
                    db.run('ROLLBACK');
                    return reject(err);
                }
                resolve();
            });
        });
    });
}

async function syncDown(dbPath: string, remoteDir: string): Promise<boolean> {
    log.info('Checking for remote updates...');
    let localVersion = 0;
    const localDbExists = await fs.access(dbPath).then(() => true).catch(() => false);

    if (localDbExists) {
        log.info('Local DB file found. Checking its version...');
        const tempDb = new (sqlite3.verbose().Database)(dbPath);
        try {
            localVersion = await new Promise<number>((resolve, reject) => {
                tempDb.get('SELECT value FROM sync_metadata WHERE key = ?', ['db_version'], (err, row: { value: number }) => {
                    if (err) return reject(err);
                    resolve(row ? row.value : 0);
                });
            });
            log.info(`Local DB version is: ${localVersion}`);
        } catch (err) {
            log.error({ err }, 'Failed to read version from local DB.');
            localVersion = 0;
        } finally {
            await new Promise<void>(resolve => tempDb.close(() => resolve()));
        }
    } else {
        log.info('No local DB file found. Assuming local version 0.');
    }

    const remoteVersion = await getRemoteVersion(remoteDir);

    if (remoteVersion > localVersion) {
        log.info(`Remote DB (v${remoteVersion}) is newer than local (v${localVersion}). Downloading...`);
        try {
            await executeRclone(['copyto', `${getRemoteString(remoteDir)}/anime.db`, dbPath]);
            log.info('Download complete. Database is now up to date.');
            return true;
        } catch (err) {
            log.error({ err }, 'CRITICAL: Failed to download newer database.');
            return false;
        }
    } else {
        log.info('Local database is up to date.');
        return false;
    }
}

export async function syncUp(db: Database, dbPath: string, remoteDir: string) {
    log.info('Starting sync-up process...');
    
    const localVersion = await getLocalVersion(db);
    const remoteVersion = await getRemoteVersion(remoteDir);

    if (localVersion > remoteVersion) {
        log.info(`Local DB (v${localVersion}) is newer than remote (v${remoteVersion}). Uploading...`);
        try {
            log.info('--> Uploading database file...');
            await executeRclone(['copyto', dbPath, `${getRemoteString(remoteDir)}/anime.db`]);
            log.info('<-- Database file uploaded successfully.');

            log.info('--> Uploading manifest file...');
            const newManifest = JSON.stringify({ version: localVersion });
            await fs.writeFile(TEMP_MANIFEST_PATH, newManifest);
            await executeRclone(['copyto', TEMP_MANIFEST_PATH, `${getRemoteString(remoteDir)}/sync_manifest.json`]);
            await fs.unlink(TEMP_MANIFEST_PATH);
            log.info(`<-- Manifest updated to v${localVersion}. Upload complete.`);
        } catch (err) {
            log.error({ err }, 'Upload failed.');
        }
    } else if (remoteVersion > localVersion) {
        log.warn(`Remote DB (v${remoteVersion}) is newer than local (v${localVersion}). A sync-down is required. Skipping upload.`);
    } else {
        log.info('Local and remote databases are in sync. No upload needed.');
    }
}

export async function syncDownOnBoot(dbPath: string, remoteDir: string) {
    log.info('Checking for remote updates on boot...');
    await syncDown(dbPath, remoteDir);
}