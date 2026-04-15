import { DatabaseSync } from 'node:sqlite'
import fs from 'fs'
import path from 'path'
import logger from './logger'

type BindableValue = string | number | bigint | null | Uint8Array

export class DatabaseWrapper {
  private db: DatabaseSync
  private dbPath: string

  /**
   * NOTE: Node 22's DatabaseSync is 100% synchronous.
   * While this wrapper provides callback/Promise interfaces to maintain compatibility
   * with asynchronous drivers, calls to this database will block the Node.js event
   * loop while executing. This is typically fine for local/single-user apps,
   * but heavy queries could impact concurrent tasks like video streaming.
   */
  constructor(dbPath: string, db: DatabaseSync) {
    this.dbPath = dbPath
    this.db = db
  }

  public static async create(dbPath: string): Promise<DatabaseWrapper> {
    try {
      const dir = path.dirname(dbPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      const db = new DatabaseSync(dbPath)
      return new DatabaseWrapper(dbPath, db)
    } catch (e) {
      logger.error({ err: e }, `Failed to initialize database at ${dbPath}`)
      throw e
    }
  }

  public scheduleSave() {
    // No-op for built-in database
  }

  public async saveNow(retryCount = 0) {
    // No-op for built-in database
  }

  public configure(option: string, value: unknown) {
    // No-op
  }

  public serialize(cb: () => void) {
    cb()
  }

  public close(cb?: (err: Error | null) => void) {
    try {
      this.db.close()
      if (cb) cb(null)
    } catch (e) {
      logger.error({ err: e }, 'Error during database close')
      if (cb) cb(e as Error)
    }
  }

  public run(
    query: string,
    params?: unknown[] | ((err: Error | null) => void),
    cb?: (err: Error | null) => void,
    options?: { skipSave?: boolean }
  ) {
    if (typeof params === 'function') {
      cb = params as (err: Error | null) => void
      params = []
    }
    try {
      const stmt = this.db.prepare(query)
      if (params && Array.isArray(params) && params.length > 0) {
        stmt.run(...(params as BindableValue[]))
      } else {
        stmt.run()
      }
      if (cb) cb(null)
    } catch (e) {
      logger.error({ err: e, query, params }, 'SQL Execution Error (run)')
      if (cb) cb(e as Error)
    }
  }

  public get<T = unknown>(
    query: string,
    params?: unknown[] | ((err: Error | null, row: T) => void),
    cb?: (err: Error | null, row: T) => void
  ) {
    if (typeof params === 'function') {
      cb = params as (err: Error | null, row: T) => void
      params = []
    }
    try {
      const stmt = this.db.prepare(query)
      let res: T | undefined
      if (params && Array.isArray(params) && params.length > 0) {
        res = stmt.get(...(params as BindableValue[])) as T | undefined
      } else {
        res = stmt.get() as T | undefined
      }
      if (cb) cb(null, (res === undefined ? null : res) as unknown as T)
    } catch (e) {
      logger.error({ err: e, query, params }, 'SQL Execution Error (get)')
      if (cb) cb(e as Error, null as unknown as T)
    }
  }

  public all<T = unknown>(
    query: string,
    params?: unknown[] | ((err: Error | null, rows: T[]) => void),
    cb?: (err: Error | null, rows: T[]) => void
  ) {
    if (typeof params === 'function') {
      cb = params as (err: Error | null, rows: T[]) => void
      params = []
    }
    try {
      const stmt = this.db.prepare(query)
      let res: T[]
      if (params && Array.isArray(params) && params.length > 0) {
        res = stmt.all(...(params as BindableValue[])) as T[]
      } else {
        res = stmt.all() as T[]
      }
      if (cb) cb(null, res)
    } catch (e) {
      logger.error({ err: e, query, params }, 'SQL Execution Error (all)')
      if (cb) cb(e as Error, [])
    }
  }

  public prepare(query: string) {
    const stmt = this.db.prepare(query)

    return {
      run: (...args: unknown[]) => {
        stmt.run(...(args as BindableValue[]))
      },
      finalize: () => {
        // No-op
      },
    }
  }

  /**
   * Performs a safe backup of the live database using VACUUM INTO.
   * This is safe even when WAL mode is enabled.
   */
  public backup(backupPath: string) {
    try {
      this.db.exec(`VACUUM INTO '${backupPath}'`)
    } catch (e) {
      logger.error({ err: e, backupPath }, 'Database backup failed via VACUUM INTO')
      throw e
    }
  }
}
