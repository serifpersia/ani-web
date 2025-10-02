import type { Database } from 'sqlite3';
import { getDeviceId } from './device-id';
import { v4 as uuidv4 } from 'uuid';
import logger from './logger';

const log = logger.child({ module: 'TrackedWrite' });

interface ChangeDetails {
    table_name: string;
    row_id: string;
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    data: string | null;
}

export async function performTrackedWriteTransaction(
    db: Database,
    changeDetails: ChangeDetails,
    operation: (tx: Database) => void
): Promise<void> {
    const deviceId = await getDeviceId();

    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            operation(db);
            const changeId = uuidv4();
            const timestamp = new Date().toISOString();
            db.run(
                `INSERT INTO change_log (id, device_id, table_name, row_id, operation, data, timestamp, synced) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
                [changeId, deviceId, changeDetails.table_name, changeDetails.row_id, changeDetails.operation, changeDetails.data, timestamp],
                (err: Error | null) => {
                    if (err) {
                        log.error({ err }, 'Failed to log change, rolling back transaction.');
                        db.run('ROLLBACK');
                        return reject(err);
                    }
                    db.run('COMMIT', (commitErr: Error | null) => {
                        if (commitErr) {
                            log.error({ err: commitErr }, 'Transaction commit failed. Rolling back.');
                            db.run('ROLLBACK');
                            return reject(commitErr);
                        }
                        resolve();
                    });
                }
            );
        });
    });
}