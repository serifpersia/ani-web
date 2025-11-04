import { spawn, exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Database } from 'sqlite3';
import sqlite3 from 'sqlite3';
import cliProgress from 'cli-progress';
import { initialize as initializeSyncConfig, getRemoteString, setActiveRemote } from './sync-config';
import logger from './logger';

const log = logger.child({ module: 'Sync' });

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
    return new Promise((resolve, reject) => {
        const rcloneProcess = spawn('rclone', args, {
            stdio: 'ignore'
        });

        rcloneProcess.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Rclone process exited with code ${code}`));
            }
        });

        rcloneProcess.on('error', (err) => {
            reject(err);
        });
    });
}

function executeRcloneWithProgress(args: string[], multibar: cliProgress.MultiBar, taskName: string): Promise<void> {
    const argsWithProgress = [...args, '--progress'];
    log.info(`Executing: rclone ${argsWithProgress.join(' ')}`);

    const progressBar = multibar.create(100, 0, { task: taskName });

    return new Promise((resolve, reject) => {
        const rcloneProcess = spawn('rclone', argsWithProgress, {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        rcloneProcess.stderr.on('data', (data: Buffer) => {
            const line = data.toString();
            const match = line.match(/(\d+)%/);
            if (match) {
                const percentage = parseInt(match[1], 10);
                progressBar.update(percentage);
            }
        });

        rcloneProcess.on('close', (code) => {
            progressBar.update(100);
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
            log.info('Found "gdrive" remote.');
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

async function getRemoteVersion(remoteDir: string, multibar?: cliProgress.MultiBar): Promise<number> {
    log.info('Fetching remote manifest...');
    try {
        if (multibar) {
            await executeRcloneWithProgress(['copyto', `${getRemoteString(remoteDir)}/sync_manifest.json`, TEMP_MANIFEST_PATH], multibar, "Fetching remote manifest");
        } else {
            await executeRclone(['copyto', `${getRemoteString(remoteDir)}/sync_manifest.json`, TEMP_MANIFEST_PATH]);
        }
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

async function getLocalVersion(db: Database): Promise<number> {
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

async function getSyncMetadata(db: Database): Promise<{ localVersion: number, lastSyncedVersion: number, isDirty: boolean }> {
    return new Promise((resolve, reject) => {
        db.all('SELECT key, value FROM sync_metadata', (err, rows: { key: string, value: number }[]) => {
            if (err) return reject(err);
            const metadata = rows.reduce((acc, row) => {
                acc[row.key] = row.value;
                return acc;
            }, {} as Record<string, number>);
            resolve({
                localVersion: metadata.db_version || 0,
                lastSyncedVersion: metadata.last_synced_version || 0,
                isDirty: !!metadata.is_dirty
            });
        });
    });
}

export async function syncDownOnBoot(db: Database, dbPath: string, remoteDir: string, closeMainDb: () => Promise<void>): Promise<boolean> {
    log.info('--> Performing initial sync check on boot...');
    const multibar = new cliProgress.MultiBar({
        format: ' {bar} | {task} | {percentage}%',
        hideCursor: true,
    });
    const mainProgressBar = multibar.create(100, 0, { task: "Overall Sync" });

    const localVersion = await getLocalVersion(db);
    const remoteVersion = await getRemoteVersion(remoteDir, multibar);
    mainProgressBar.update(10);

    if (remoteVersion > localVersion) {
        log.warn(`Remote DB (v${remoteVersion}) is newer than local (v${localVersion}). A sync-down is required.`);
        
        await closeMainDb();

        const backupPath = `${dbPath}.bak`;
        try {
            log.info(`Backing up local database to ${backupPath}...`);
            await fs.copyFile(dbPath, backupPath);
            log.info('Backup complete.');
            mainProgressBar.update(25);

            const dbName = path.basename(dbPath);
            await executeRcloneWithProgress(['copyto', `${getRemoteString(remoteDir)}/${dbName}`, dbPath, '--ignore-times'], multibar, "Downloading Database");
            log.info('Download complete. Database is now up to date.');
            mainProgressBar.update(75);
            
            await fs.unlink(backupPath);
            log.info('Cleaned up backup file.');
            mainProgressBar.update(100);
            multibar.stop();
            return true;
        } catch (err) {
            log.error({ err }, 'CRITICAL: Failed to download newer database. Restoring from backup.');
            multibar.stop();
            try {
                await fs.copyFile(backupPath, dbPath);
                log.info('Successfully restored database from backup.');
            } catch (restoreErr) {
                log.error({ restoreErr }, 'FATAL: Failed to restore database from backup. Manual intervention may be required.');
            }
            return true;
        }
    } else {
        log.info('Local database is up to date. No download needed on boot.');
        mainProgressBar.update(100);
        multibar.stop();
        return false;
    }
}

export async function syncUp(db: Database, dbPath: string, remoteDir: string): Promise<void> {
    log.info('--> Initiating sync-up process...');
    const { localVersion, isDirty } = await getSyncMetadata(db);

    if (!isDirty) {
        log.info('Database is not dirty. Skipping sync-up.');
        return;
    }

    const multibar = new cliProgress.MultiBar({
        format: ' {bar} | {task} | {percentage}%',
        hideCursor: true,
    });
    const mainProgressBar = multibar.create(100, 0, { task: "Overall Sync" });

    const remoteVersion = await getRemoteVersion(remoteDir, multibar);
    mainProgressBar.update(10);

    const performUpload = async () => {
        log.info(`Local DB (v${localVersion}) is newer than remote (v${remoteVersion}). Uploading...`);
        const dbName = path.basename(dbPath);

        try {
            try {
                await executeRcloneWithProgress(['deletefile', `${getRemoteString(remoteDir)}/${dbName}`], multibar, "Deleting old DB");
            } catch (e) {
                log.warn('Could not delete remote DB before upload (it may not have existed).');
            }
            mainProgressBar.update(25);

            await executeRcloneWithProgress(['copyto', dbPath, `${getRemoteString(remoteDir)}/${dbName}`], multibar, "Uploading DB");
            mainProgressBar.update(50);
            
            const newManifest = JSON.stringify({ version: localVersion });
            await fs.writeFile(TEMP_MANIFEST_PATH, newManifest);

            try {
                await executeRcloneWithProgress(['deletefile', `${getRemoteString(remoteDir)}/sync_manifest.json`], multibar, "Deleting old manifest");
            } catch (e) {
                log.warn('Could not delete remote manifest before upload (it may not have existed).');
            }
            mainProgressBar.update(75);

            await executeRcloneWithProgress(['copyto', TEMP_MANIFEST_PATH, `${getRemoteString(remoteDir)}/sync_manifest.json`], multibar, "Uploading manifest");
            await fs.unlink(TEMP_MANIFEST_PATH);
            mainProgressBar.update(100);
            multibar.stop();
            
            await new Promise<void>((resolve, reject) => {
                db.serialize(() => {
                    db.run('UPDATE sync_metadata SET value = 0 WHERE key = "is_dirty"');
                    db.run('UPDATE sync_metadata SET value = ? WHERE key = "last_synced_version"', [localVersion], (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
                });
            });
            log.info(`<-- Manifest updated to v${localVersion}. Upload complete.`);
        } catch (err) {
            log.error({ err }, 'Upload failed.');
            multibar.stop();
        }
    };

    if (localVersion > remoteVersion) {
        await performUpload();
    } else if (remoteVersion > localVersion) {
        log.error(`CONFLICT: Remote DB (v${remoteVersion}) is newer than local (v${localVersion}), but local has unsynced changes. Manual intervention required.`);
        multibar.stop();
    } else if (localVersion === remoteVersion && isDirty) {
        log.warn(`Divergence detected. Local and remote are at same version (${localVersion}) but local is dirty. Forcing overwrite.`);
        await performUpload();
    } else {
        log.info('Local and remote databases are in sync. No upload needed.');
        multibar.stop();
    }
}

export async function performWriteTransaction(db: Database, runnable: (tx: Database) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            runnable(db);
            db.run('UPDATE sync_metadata SET value = value + 1 WHERE key = "db_version"');
            db.run('UPDATE sync_metadata SET value = 1 WHERE key = "is_dirty"');
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

export function initializeDatabase(dbPath: string): Promise<Database> {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                log.error({ err }, 'Database opening error');
                return reject(err);
            }
        });

        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS watchlist (id TEXT NOT NULL, name TEXT, thumbnail TEXT, status TEXT, PRIMARY KEY (id))`);
            db.run(`CREATE TABLE IF NOT EXISTS watched_episodes (showId TEXT NOT NULL, episodeNumber TEXT NOT NULL, watchedAt DATETIME DEFAULT CURRENT_TIMESTAMP, currentTime REAL DEFAULT 0, duration REAL DEFAULT 0, PRIMARY KEY (showId, episodeNumber))`);
            db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT NOT NULL, value TEXT, PRIMARY KEY (key))`);
            db.run(`CREATE TABLE IF NOT EXISTS shows_meta (id TEXT PRIMARY KEY, name TEXT, thumbnail TEXT)`);
            db.run(`CREATE TABLE IF NOT EXISTS sync_metadata (key TEXT PRIMARY KEY, value INTEGER)`);
            db.run(`INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('db_version', 1)`);
            db.run(`INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('last_synced_version', 0)`);
            db.run(`INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('is_dirty', 0)`);

            db.run(`CREATE INDEX IF NOT EXISTS idx_watched_episodes_showId ON watched_episodes(showId)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_watched_episodes_watchedAt ON watched_episodes(watchedAt)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_watchlist_status ON watchlist(status)`);

            db.all("PRAGMA table_info(watchlist)", (err, rows: { name: string }[]) => {
                if (err) { log.error({ err }, "Error checking watchlist schema"); return; }
                const columns = rows.map(col => col.name);
                if (!columns.includes("nativeName")) {
                    db.run(`ALTER TABLE watchlist ADD COLUMN nativeName TEXT`);
                }
                if (!columns.includes("englishName")) {
                    db.run(`ALTER TABLE watchlist ADD COLUMN englishName TEXT`);
                }
            });

            db.all("PRAGMA table_info(shows_meta)", (err, rows: { name: string }[]) => {
                if (err) { log.error({ err }, "Error checking shows_meta schema"); return; }
                const columns = rows.map(col => col.name);
                if (!columns.includes("nativeName")) {
                    db.run(`ALTER TABLE shows_meta ADD COLUMN nativeName TEXT`);
                }
                if (!columns.includes("englishName")) {
                    db.run(`ALTER TABLE shows_meta ADD COLUMN englishName TEXT`);
                }
                if (!columns.includes("episodeCount")) {
                    db.run(`ALTER TABLE shows_meta ADD COLUMN episodeCount INTEGER`);
                }
            });

            db.run('PRAGMA user_version', (err: Error | null) => {
                if (err) {
                    log.error({ err }, 'Failed to finalize database initialization.');
                    return reject(err);
                }
                log.info('Database schema initialized/verified.');
                resolve(db);
            });
        });
    });
}