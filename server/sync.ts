import { spawn, exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Database } from 'sqlite3';
import { getRemoteString, setActiveRemote, initialize as initializeSyncConfig, RCLONE_REMOTE_DIR } from './sync-config';
import logger from './logger';
import { getDeviceId } from './device-id';
import { v4 as uuidv4 } from 'uuid';
import { performTrackedWriteTransaction as originalPerformTrackedWriteTransaction } from './tracked-write';
import { rimraf } from 'rimraf';

const log = logger.child({ module: 'Sync' });

const TEMP_SYNC_DIR = path.join(__dirname, '..', 'sync_temp');
const TEMP_MANIFEST_PATH = path.join(__dirname, '..', 'manifest.temp.json');

interface Change {
    id: string;
    device_id: string;
    table_name: string;
    row_id: string;
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    data: string | null;
    timestamp: string;
}

interface Manifest {
    snapshotTimestamp: string | null;
}

function executeCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(command, (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message));
            resolve(stdout);
        });
    });
}

function executeRclone(args: string[]): Promise<void> {
    const argsWithProgress = [...args, '--progress', '--transfers=16', '--checkers=16'];
    log.info(`Executing: rclone ${argsWithProgress.join(' ')}`);
    return new Promise((resolve, reject) => {
        const rcloneProcess = spawn('rclone', argsWithProgress, { stdio: 'pipe' });
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

async function getRemoteManifest(): Promise<Manifest> {
    try {
        await executeRclone(['copyto', `${getRemoteString(RCLONE_REMOTE_DIR)}/manifest.json`, TEMP_MANIFEST_PATH]);
        const content = await fs.readFile(TEMP_MANIFEST_PATH, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        log.warn('Remote manifest not found or invalid. Assuming a default state.');
        return { snapshotTimestamp: null };
    } finally {
        await fs.unlink(TEMP_MANIFEST_PATH).catch(() => {});
    }
}

async function updateRemoteManifest(manifest: Manifest): Promise<void> {
    try {
        await fs.writeFile(TEMP_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
        await executeRclone(['copyto', TEMP_MANIFEST_PATH, `${getRemoteString(RCLONE_REMOTE_DIR)}/manifest.json`]);
        log.info('Successfully updated remote manifest.');
    } finally {
        await fs.unlink(TEMP_MANIFEST_PATH).catch(() => {});
    }
}

export async function syncDownOnBoot(dbPath: string): Promise<void> {
    const localDbExists = await fs.access(dbPath).then(() => true).catch(() => false);
    if (localDbExists) {
        log.info('Local database already exists. Skipping boot snapshot download.');
        return;
    }

    log.info('Local database not found. Attempting to download latest snapshot...');
    const manifest = await getRemoteManifest();
    if (!manifest.snapshotTimestamp) {
        log.warn('No remote snapshot found to download. A new database will be created.');
        return;
    }

    try {
        await executeRclone(['copyto', `${getRemoteString(RCLONE_REMOTE_DIR)}/snapshot.db`, dbPath]);
        log.info('Successfully downloaded database snapshot.');
    } catch (error) {
        log.error({ err: error }, 'CRITICAL: Failed to download database snapshot on boot.');
    }
}

export async function createSnapshotIfNeeded(db: Database, dbPath: string): Promise<void> {
    const manifest = await getRemoteManifest();
    const now = new Date();
    const snapshotAgeHours = manifest.snapshotTimestamp
        ? (now.getTime() - new Date(manifest.snapshotTimestamp).getTime()) / (1000 * 60 * 60)
        : Infinity;

    if (snapshotAgeHours < 24) {
        log.info(`Snapshot is fresh (${snapshotAgeHours.toFixed(1)} hours old). No new snapshot needed.`);
        return;
    }

    log.info('Current snapshot is outdated or non-existent. Creating a new one...');
    try {
        await executeRclone(['copyto', dbPath, `${getRemoteString(RCLONE_REMOTE_DIR)}/snapshot.db`]);
        log.info('New database snapshot uploaded.');

        const newManifest: Manifest = { snapshotTimestamp: now.toISOString() };
        await updateRemoteManifest(newManifest);

        log.info('Purging old change files from remote...');
        await executeRclone(['purge', `${getRemoteString(RCLONE_REMOTE_DIR)}/changes`]);
        log.info('Snapshot creation and cleanup complete.');

    } catch (error) {
        log.error({ err: error }, 'Failed to create a new snapshot.');
    }
}

export async function synchronizeChanges(db: Database): Promise<void> {
    log.info('--- Starting Delta Sync Cycle ---');
    await pushLocalChanges(db);
    await pullAndApplyRemoteChanges(db);
    log.info('--- Delta Sync Cycle Finished ---');
}

async function pushLocalChanges(db: Database) {
    const unsyncedChanges: (Change & { internal_id: number })[] = await new Promise((resolve, reject) => {
        db.all('SELECT rowid as internal_id, * FROM change_log WHERE synced = 0', (err, rows) => {
            if (err) return reject(err);
            resolve(rows as any);
        });
    });

    if (unsyncedChanges.length === 0) {
        log.info('No local changes to push.');
        return;
    }

    log.info(`Found ${unsyncedChanges.length} local changes to push.`);
    await fs.mkdir(TEMP_SYNC_DIR, { recursive: true });

    for (const change of unsyncedChanges) {
        const changeFilePath = path.join(TEMP_SYNC_DIR, `${change.id}.json`);
        await fs.writeFile(changeFilePath, JSON.stringify(change, null, 2));
    }

    try {
        await executeRclone(['copy', TEMP_SYNC_DIR, `${getRemoteString(RCLONE_REMOTE_DIR)}/changes`]);
        log.info('Successfully pushed changes to remote.');

        const idsToUpdate = unsyncedChanges.map(c => c.internal_id);
        const placeholders = idsToUpdate.map(() => '?').join(',');
        await new Promise<void>((resolve, reject) => {
            db.run(`UPDATE change_log SET synced = 1 WHERE rowid IN (${placeholders})`, idsToUpdate, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
        log.info('Marked pushed changes as synced.');
    } finally {
        await rimraf(TEMP_SYNC_DIR);
    }
}

async function pullAndApplyRemoteChanges(db: Database) {
    log.info('Pulling remote changes...');
    await fs.mkdir(TEMP_SYNC_DIR, { recursive: true });

    try {
        await executeRclone(['copy', `${getRemoteString(RCLONE_REMOTE_DIR)}/changes`, TEMP_SYNC_DIR]);
        const changeFiles = await fs.readdir(TEMP_SYNC_DIR);

        if (changeFiles.length === 0) {
            log.info('No remote changes to apply.');
            return;
        }

        log.info(`Found ${changeFiles.length} remote change files.`);
        const deviceId = await getDeviceId();
        let appliedChangesCount = 0;

        for (const fileName of changeFiles) {
            const filePath = path.join(TEMP_SYNC_DIR, fileName);
            const content = await fs.readFile(filePath, 'utf-8');
            const change: Change = JSON.parse(content);

            if (change.device_id === deviceId) continue;

            const existingChange: { count: number } | undefined = await new Promise((resolve, reject) => {
                db.get('SELECT COUNT(*) as count FROM change_log WHERE id = ?', [change.id], (err, row) => {
                    if (err) return reject(err);
                    resolve(row as { count: number });
                });
            });

            if (existingChange && existingChange.count > 0) continue;

            await applyChangeToDb(db, change);
            appliedChangesCount++;
        }
        log.info(`Applied ${appliedChangesCount} new changes from remote.`);

    } catch (error) {
        log.error({ err: error }, 'Failed to pull and apply remote changes.');
    } finally {
        await rimraf(TEMP_SYNC_DIR);
    }
}

async function applyChangeToDb(db: Database, change: Change): Promise<void> {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            const data = change.data ? JSON.parse(change.data) : {};
            const columns = Object.keys(data);
            const values = Object.values(data);
            let sql = '';
            let params: any[] = [];

            switch (change.operation) {
                case 'INSERT':
                case 'UPDATE':
                    const placeholders = columns.map(() => '?').join(',');
                    sql = `INSERT OR REPLACE INTO ${change.table_name} (${columns.join(',')}) VALUES (${placeholders})`;
                    params = values;
                    break;
                case 'DELETE':
                    sql = `DELETE FROM ${change.table_name} WHERE id = ?`;
                    params = [change.row_id];
                    break;
            }

            db.run(sql, params, (err: Error | null) => {
                if (err) {
                    log.error({ err, change }, 'Failed to apply a single change to DB.');
                    db.run('ROLLBACK');
                    return reject(err);
                }
                db.run(
                    `INSERT INTO change_log (id, device_id, table_name, row_id, operation, data, timestamp, synced) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
                    [change.id, change.device_id, change.table_name, change.row_id, change.operation, change.data, change.timestamp],
                    (logErr: Error | null) => {
                        if (logErr) {
                            log.error({ err: logErr, change }, 'Failed to log an applied remote change.');
                            db.run('ROLLBACK');
                            return reject(logErr);
                        }
                        db.run('COMMIT', (commitErr: Error | null) => {
                            if (commitErr) return reject(commitErr);
                            resolve();
                        });
                    }
                );
            });
        });
    });
}

export const performTrackedWriteTransaction = originalPerformTrackedWriteTransaction;

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