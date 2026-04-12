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

  private scheduleSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout)
    this.saveTimeout = setTimeout(() => {
      this.saveNow()
    }, 500)
  }

  public saveNow() {
    try {
      const data = this.db.export()
      fs.writeFileSync(this.dbPath, Buffer.from(data))
    } catch (err) {
      logger.error({ err }, 'Failed to save database to disk')
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
      this.saveNow()
    }
    try {
      this.db.close()
      if (cb) cb(null)
    } catch (e) {
      if (cb) cb(e as Error)
    }
  }

  public run(
    query: string,
    params?: unknown[] | ((err: Error | null) => void),
    cb?: (err: Error | null) => void
  ) {
    if (typeof params === 'function') {
      cb = params as (err: Error | null) => void
      params = []
    }
    try {
      if (params && Array.isArray(params) && params.length > 0) {
        const stmt = this.db.prepare(query)
        stmt.run(params as unknown as BindParams)
        stmt.free()
      } else {
        this.db.run(query)
      }
      this.scheduleSave()
      if (cb) cb(null)
    } catch (e) {
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
        stmt.bind(params as unknown as BindParams)
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
        stmt.bind(params as unknown as BindParams) // will see if this complains
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
        stmt.run(args as unknown as BindParams)
        this.scheduleSave()
      },
      finalize: () => {
        stmt.free()
      },
    }
  }
}
