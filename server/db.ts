import initSqlJs, { Database as SqlJsDatabase, BindParams } from 'sql.js'
import fs from 'fs'
import path from 'path'
import logger from './logger'

export class DatabaseWrapper {
  private db: SqlJsDatabase
  private dbPath: string
  private saveTimeout: NodeJS.Timeout | null = null

  constructor(dbPath: string, db: SqlJsDatabase) {
    this.dbPath = dbPath
    this.db = db
  }

  public static async create(dbPath: string): Promise<DatabaseWrapper> {
    const SQL = await initSqlJs()
    let data: Buffer | undefined
    try {
      if (fs.existsSync(dbPath)) {
        data = fs.readFileSync(dbPath)
      }
    } catch (e) {
      logger.warn({ err: e }, `Failed to read database at ${dbPath}`)
    }

    let db: SqlJsDatabase
    if (data && data.length > 0) {
      db = new SQL.Database(data)
    } else {
      db = new SQL.Database()
    }
    return new DatabaseWrapper(dbPath, db)
  }

  public scheduleSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout)
    this.saveTimeout = setTimeout(() => {
      this.saveNow()
    }, 500)
  }

  public async saveNow(retryCount = 0) {
    try {
      const data = this.db.export()
      await fs.promises.writeFile(this.dbPath, Buffer.from(data))
    } catch (err) {
      if (retryCount < 3) {
        setTimeout(() => this.saveNow(retryCount + 1), 100)
      } else {
        logger.error({ err }, 'Failed to save database to disk after 3 retries')
      }
    }
  }

  public configure(option: string, value: unknown) {
    // No-op for sql.js compatibility layer
  }

  public serialize(cb: () => void) {
    // Everything is synchronous anyway
    cb()
  }

  public close(cb?: (err: Error | null) => void) {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }
    try {
      // Synchronously flush to disk before closing to prevent data loss
      const data = this.db.export()
      fs.writeFileSync(this.dbPath, Buffer.from(data))
      this.db.close()
      if (cb) cb(null)
    } catch (e) {
      logger.error({ err: e }, 'Error during database close/flush')
      try {
        this.db.close()
      } catch {
        // Already closing, ignore
      }
      if (cb) cb(e as Error)
    }
  }

  private sanitizeParams(params: unknown[]): BindParams {
    return params.map((p) => (p === undefined ? null : p)) as unknown as BindParams
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
      if (params && Array.isArray(params) && params.length > 0) {
        this.db.run(query, this.sanitizeParams(params))
      } else {
        this.db.run(query)
      }
      if (!options?.skipSave) {
        this.scheduleSave()
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
      if (params && Array.isArray(params) && params.length > 0) {
        stmt.bind(this.sanitizeParams(params))
      }
      let res: T | null = null
      if (stmt.step()) {
        res = stmt.getAsObject() as T
      }
      stmt.free()
      if (cb) cb(null, res as T)
    } catch (e) {
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
      if (params && Array.isArray(params) && params.length > 0) {
        stmt.bind(this.sanitizeParams(params))
      }
      const res: T[] = []
      while (stmt.step()) {
        res.push(stmt.getAsObject() as T)
      }
      stmt.free()
      if (cb) cb(null, res)
    } catch (e) {
      if (cb) cb(e as Error, [])
    }
  }

  public prepare(query: string) {
    const stmt = this.db.prepare(query)

    return {
      run: (...args: unknown[]) => {
        stmt.run(this.sanitizeParams(args) as unknown as BindParams)
        this.scheduleSave()
      },
      finalize: () => {
        stmt.free()
      },
    }
  }
}
