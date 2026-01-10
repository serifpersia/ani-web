"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSyncProvider = initSyncProvider;
exports.syncDownOnBoot = syncDownOnBoot;
exports.syncUp = syncUp;
exports.performWriteTransaction = performWriteTransaction;
exports.initializeDatabase = initializeDatabase;
const fs = __importStar(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const sqlite3_1 = __importDefault(require("sqlite3"));
const logger_1 = __importDefault(require("./logger"));
const google_1 = require("./google");
const rclone_1 = require("./rclone");
const config_1 = require("./config");
const log = logger_1.default.child({ module: 'Sync' });
let isSyncing = false;
let activeProvider = 'none';
async function initSyncProvider() {
    if (google_1.googleDriveService.isAuthenticated()) {
        activeProvider = 'google';
        log.info("Sync Provider: Google Drive API");
        return;
    }
    const rcloneAvailable = await rclone_1.rcloneService.init();
    if (rcloneAvailable) {
        activeProvider = 'rclone';
        log.info(`Sync Provider: Rclone (${rclone_1.rcloneService.getRemoteName()})`);
        return;
    }
    activeProvider = 'none';
    log.info("No sync provider available.");
}
async function getRemoteVersion(remoteFolder) {
    try {
        if (activeProvider === 'google') {
            const folderId = await google_1.googleDriveService.ensureFolder(remoteFolder);
            const file = await google_1.googleDriveService.findFile(config_1.CONFIG.MANIFEST_FILENAME, folderId);
            if (!file)
                return { version: 0 };
            await google_1.googleDriveService.downloadFile(file.id, config_1.CONFIG.TEMP_MANIFEST_PATH);
            const content = await fs.readFile(config_1.CONFIG.TEMP_MANIFEST_PATH, 'utf-8');
            await fs.unlink(config_1.CONFIG.TEMP_MANIFEST_PATH);
            return { version: JSON.parse(content).version || 0, fileId: file.id };
        }
        if (activeProvider === 'rclone') {
            const exists = await rclone_1.rcloneService.fileExists(remoteFolder, config_1.CONFIG.MANIFEST_FILENAME);
            if (!exists)
                return { version: 0 };
            await rclone_1.rcloneService.downloadFile(remoteFolder, config_1.CONFIG.MANIFEST_FILENAME, config_1.CONFIG.TEMP_MANIFEST_PATH);
            const content = await fs.readFile(config_1.CONFIG.TEMP_MANIFEST_PATH, 'utf-8');
            await fs.unlink(config_1.CONFIG.TEMP_MANIFEST_PATH);
            return { version: JSON.parse(content).version || 0 };
        }
    }
    catch (err) {
        log.warn({ err }, 'Could not read remote manifest.');
    }
    return { version: 0 };
}
async function getLocalVersion(db) {
    return new Promise((resolve) => {
        db.get('SELECT value FROM sync_metadata WHERE key = ?', ['db_version'], (err, row) => {
            resolve(row ? row.value : 0);
        });
    });
}
async function isLocalDbEmpty(db) {
    return new Promise((resolve) => {
        db.get('SELECT COUNT(*) as count FROM watchlist', (err, row) => {
            if (err)
                resolve(true);
            else
                resolve(row.count === 0);
        });
    });
}
async function getSyncMetadata(db) {
    return new Promise((resolve, reject) => {
        db.all('SELECT key, value FROM sync_metadata', (err, rows) => {
            if (err)
                return reject(err);
            const metadata = rows.reduce((acc, row) => {
                acc[row.key] = row.value;
                return acc;
            }, {});
            resolve({
                localVersion: metadata.db_version || 0,
                isDirty: !!metadata.is_dirty
            });
        });
    });
}
async function syncDownOnBoot(db, dbPath, remoteFolderName, closeMainDb) {
    if (activeProvider === 'none')
        return false;
    if (isSyncing)
        return false;
    isSyncing = true;
    try {
        log.info(`--> Initial sync check (${activeProvider})...`);
        const localVersion = await getLocalVersion(db);
        const isEmpty = await isLocalDbEmpty(db);
        const { version: remoteVersion } = await getRemoteVersion(remoteFolderName);
        log.info(`Sync Check: Local v${localVersion} (Empty: ${isEmpty}) vs Remote v${remoteVersion}`);
        if (remoteVersion > localVersion || (isEmpty && remoteVersion > 0)) {
            log.info(`Downloading remote database (Remote v${remoteVersion})...`);
            await closeMainDb();
            const backupPath = `${dbPath}.bak`;
            const dbName = path_1.default.basename(dbPath);
            try {
                await fs.copyFile(dbPath, backupPath);
                if (activeProvider === 'google') {
                    const folderId = await google_1.googleDriveService.ensureFolder(remoteFolderName);
                    const remoteFile = await google_1.googleDriveService.findFile(dbName, folderId);
                    if (remoteFile)
                        await google_1.googleDriveService.downloadFile(remoteFile.id, dbPath);
                    else
                        throw new Error("Manifest exists but DB file missing.");
                }
                else if (activeProvider === 'rclone') {
                    await rclone_1.rcloneService.downloadFile(remoteFolderName, dbName, dbPath);
                }
                await fs.unlink(backupPath);
                log.info('Sync down complete.');
                return true;
            }
            catch (err) {
                log.error({ err }, 'Sync down failed. Restoring backup.');
                try {
                    await fs.copyFile(backupPath, dbPath);
                }
                catch { }
                return true;
            }
        }
        else {
            log.info('Local DB is up to date.');
            return false;
        }
    }
    catch (err) {
        log.error({ err }, 'Sync boot error.');
        return false;
    }
    finally {
        isSyncing = false;
    }
}
async function syncUp(db, dbPath, remoteFolderName) {
    if (activeProvider === 'none')
        return;
    if (isSyncing)
        return;
    isSyncing = true;
    try {
        const { localVersion, isDirty } = await getSyncMetadata(db);
        if (!isDirty)
            return;
        log.info(`--> Syncing up (Local v${localVersion})...`);
        const { version: remoteVersion, fileId: manifestId } = await getRemoteVersion(remoteFolderName);
        if (remoteVersion > localVersion) {
            log.error(`CONFLICT: Remote v${remoteVersion} > Local v${localVersion}. Aborting upload.`);
            return;
        }
        const dbName = path_1.default.basename(dbPath);
        const newManifest = JSON.stringify({ version: localVersion });
        await fs.writeFile(config_1.CONFIG.TEMP_MANIFEST_PATH, newManifest);
        if (activeProvider === 'google') {
            const folderId = await google_1.googleDriveService.ensureFolder(remoteFolderName);
            const remoteDbFile = await google_1.googleDriveService.findFile(dbName, folderId);
            await google_1.googleDriveService.uploadFile(dbPath, dbName, 'application/x-sqlite3', folderId, remoteDbFile?.id);
            await google_1.googleDriveService.uploadFile(config_1.CONFIG.TEMP_MANIFEST_PATH, config_1.CONFIG.MANIFEST_FILENAME, 'application/json', folderId, manifestId);
        }
        else if (activeProvider === 'rclone') {
            await rclone_1.rcloneService.uploadFile(dbPath, remoteFolderName, dbName);
            await rclone_1.rcloneService.uploadFile(config_1.CONFIG.TEMP_MANIFEST_PATH, remoteFolderName, config_1.CONFIG.MANIFEST_FILENAME);
        }
        await fs.unlink(config_1.CONFIG.TEMP_MANIFEST_PATH);
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('UPDATE sync_metadata SET value = 0 WHERE key = "is_dirty"');
                db.run('UPDATE sync_metadata SET value = ? WHERE key = "last_synced_version"', [localVersion], (err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
            });
        });
        log.info('<-- Sync up complete.');
    }
    catch (err) {
        log.error({ err }, 'Sync up failed.');
    }
    finally {
        isSyncing = false;
    }
}
async function performWriteTransaction(db, runnable) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.configure('busyTimeout', 5000);
            db.run('BEGIN TRANSACTION');
            try {
                runnable(db);
                db.run('UPDATE sync_metadata SET value = value + 1 WHERE key = "db_version"');
                db.run('UPDATE sync_metadata SET value = 1 WHERE key = "is_dirty"');
                db.run('COMMIT', (err) => {
                    if (err) {
                        db.run('ROLLBACK');
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
            }
            catch (e) {
                db.run('ROLLBACK');
                reject(e);
            }
        });
    });
}
function initializeDatabase(dbPath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3_1.default.Database(dbPath, (err) => {
            if (err) {
                log.error({ err }, 'Database opening error');
                return reject(err);
            }
        });
        db.configure('busyTimeout', 5000);
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS watchlist (id TEXT NOT NULL, name TEXT, thumbnail TEXT, status TEXT, nativeName TEXT, englishName TEXT, PRIMARY KEY (id))`);
            db.run(`CREATE TABLE IF NOT EXISTS watched_episodes (showId TEXT NOT NULL, episodeNumber TEXT NOT NULL, watchedAt DATETIME DEFAULT CURRENT_TIMESTAMP, currentTime REAL DEFAULT 0, duration REAL DEFAULT 0, PRIMARY KEY (showId, episodeNumber))`);
            db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT NOT NULL, value TEXT, PRIMARY KEY (key))`);
            db.run(`CREATE TABLE IF NOT EXISTS shows_meta (id TEXT PRIMARY KEY, name TEXT, thumbnail TEXT, nativeName TEXT, englishName TEXT, episodeCount INTEGER)`);
            db.run(`CREATE TABLE IF NOT EXISTS sync_metadata (key TEXT PRIMARY KEY, value INTEGER)`);
            db.run(`INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('db_version', 1)`);
            db.run(`INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('last_synced_version', 0)`);
            db.run(`INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('is_dirty', 0)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_watched_episodes_showId ON watched_episodes(showId)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_watched_episodes_watchedAt ON watched_episodes(watchedAt)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_watchlist_status ON watchlist(status)`);
            const addCol = (tbl, col, type) => {
                db.all(`PRAGMA table_info(${tbl})`, (e, r) => {
                    if (!r.some(c => c.name === col))
                        db.run(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${type}`);
                });
            };
            addCol('watchlist', 'nativeName', 'TEXT');
            addCol('watchlist', 'englishName', 'TEXT');
            addCol('shows_meta', 'nativeName', 'TEXT');
            addCol('shows_meta', 'englishName', 'TEXT');
            addCol('shows_meta', 'episodeCount', 'INTEGER');
            resolve(db);
        });
    });
}
