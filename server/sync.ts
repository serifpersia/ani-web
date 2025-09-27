// server/sync.ts

import { spawn, exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Database } from 'sqlite3';
import sqlite3 from 'sqlite3';
import { initialize as initializeSyncConfig, getRemoteString, setActiveRemote } from './sync-config';

// --- CONFIGURATION ---
const TEMP_MANIFEST_PATH = path.join(__dirname, 'sync_manifest.temp.json');

const log = (message: string) => console.log(`[Sync] ${new Date().toISOString()} - ${message}`);
const error = (message: string, err?: unknown) => console.error(`[Sync] ${new Date().toISOString()} - ${message}`, err);

// Used for verification checks where we need to capture output
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
    log(`Executing: rclone ${argsWithProgress.join(' ')}`);

    return new Promise((resolve, reject) => {
        const rcloneProcess = spawn('rclone', argsWithProgress, {
            stdio: 'pipe'
        });

        rcloneProcess.stdout.pipe(process.stdout);
        rcloneProcess.stderr.pipe(process.stderr);

        rcloneProcess.on('close', (code) => {

            process.stdout.write('\n');
            if (code === 0) {
                log(`Rclone process finished successfully.`);
                resolve();
            } else {
                error(`Rclone process exited with code ${code}`);
                reject(new Error(`Rclone process exited with code ${code}`));
            }
        });

        rcloneProcess.on('error', (err) => {
            error('Failed to start rclone process.', err);
            reject(err);
        });
    });
}

export async function verifyRclone(): Promise<boolean> {
    log('Verifying rclone setup...');
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
        error('An unexpected error occurred while checking rclone version.', err);
        return false;
    }

    try {
        const remotes = await executeCommand('rclone listremotes');
        
        if (remotes.includes('mega:')) {
            log('Found "mega" remote.');
            setActiveRemote('mega');
        } else if (remotes.includes('gdrive:')) {
            log('Found "gdrive" remote. Using as fallback.');
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
        error('An unexpected error occurred while listing rclone remotes.', err);
        return false;
    }

    log('Rclone setup verified successfully.');
    await initializeSyncConfig();
    return true;
}

export async function getRemoteVersion(remoteDir: string): Promise<number> {
    log('Fetching remote manifest...');
    try {
        await executeRclone(['copyto', `${getRemoteString(remoteDir)}/sync_manifest.json`, TEMP_MANIFEST_PATH]);
        const manifestContent = await fs.readFile(TEMP_MANIFEST_PATH, 'utf-8');
        await fs.unlink(TEMP_MANIFEST_PATH);
        const manifest = JSON.parse(manifestContent);
        const version = manifest.version || 0;
        log(`Remote manifest found. Version: ${version}`);
        return version;
    } catch (err) {
        log('Could not fetch remote manifest. Assuming version 0.');
        return 0;
    }
}

export async function getLocalVersion(db: Database): Promise<number> {
    log('Getting local DB version...');
    return new Promise((resolve, reject) => {
        db.get('SELECT value FROM sync_metadata WHERE key = ?', ['db_version'], (err, row: { value: number }) => {
            if (err) return reject(err);
            const version = row ? row.value : 0;
            log(`Local DB version is: ${version}`);
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
                    db.run('ROLLBACK');
                    return reject(err);
                }
                resolve();
            });
        });
    });
}

export async function syncUp(db: Database, dbPath: string, remoteDir: string) {
    log('Starting sync-up process...');
    const localVersion = await getLocalVersion(db);
    const remoteVersion = await getRemoteVersion(remoteDir);

    if (localVersion > remoteVersion) {
        log(`Local DB (v${localVersion}) is newer than remote (v${remoteVersion}). Uploading...`);
        try {
            log('--> Uploading database file...');
            await executeRclone(['copyto', dbPath, `${getRemoteString(remoteDir)}/anime.db`]);
            log('<-- Database file uploaded successfully.');

            log('--> Uploading manifest file...');
            const newManifest = JSON.stringify({ version: localVersion });
            await fs.writeFile(TEMP_MANIFEST_PATH, newManifest);
            await executeRclone(['copyto', TEMP_MANIFEST_PATH, `${getRemoteString(remoteDir)}/sync_manifest.json`]);
            await fs.unlink(TEMP_MANIFEST_PATH);
            log(`<-- Manifest updated to v${localVersion}. Upload complete.`);
        } catch (err) {
            error('Upload failed:', err);
        }
    } else {
        log('Local database is not newer than remote. No upload needed.');
    }
}

export async function syncDownOnBoot(dbPath: string, remoteDir: string) {
    log('Checking for remote updates on boot...');
    let localVersion = 0;
    const localDbExists = await fs.access(dbPath).then(() => true).catch(() => false);

    if (localDbExists) {
        log('Local DB file found. Checking its version...');
        const tempDb = new (sqlite3.verbose().Database)(dbPath);
        localVersion = await new Promise<number>((resolve, reject) => {
            tempDb.get('SELECT value FROM sync_metadata WHERE key = ?', ['db_version'], (err, row: { value: number }) => {
                if (err) return reject(err);
                const version = row ? row.value : 0;
                log(`Local DB version is: ${version}`);
                resolve(version);
            });
        }).catch(() => 0);
        await new Promise<void>(resolve => tempDb.close(() => resolve()));
    } else {
        log('No local DB file found. Assuming local version 0.');
    }

    const remoteVersion = await getRemoteVersion(remoteDir);

    if (remoteVersion > localVersion) {
        log(`Remote DB (v${remoteVersion}) is newer than local (v${localVersion}). Downloading...`);
        try {
            await executeRclone(['copyto', `${getRemoteString(remoteDir)}/anime.db`, dbPath]);
            log('Download complete. Database is now up to date.');
        } catch (err) {
            error('CRITICAL: Failed to download newer database.', err);
        }
    } else {
        log('Local database is up to date.');
    }
}