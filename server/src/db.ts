import { DatabaseSync } from 'node:sqlite'
import fs from 'fs'
import path from 'path'
import logger from './logger'

type BindableValue = string | number | bigint | null | Uint8Array

export class DatabaseWrapper {
  private db: DatabaseSync
  private isClosed = false

  constructor(_dbPath: string, db: DatabaseSync) {
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

  public scheduleSave() {}

  public async saveNow() {}

  public configure(option: string, value: unknown) {
    if (option === 'busyTimeout') {
      this.db.exec(`PRAGMA busy_timeout = ${value}`)
    }
  }

  public serialize(cb: () => void) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      cb()
      this.db.exec('COMMIT')
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }

  public close(cb?: (err: Error | null) => void) {
    if (this.isClosed) {
      if (cb) cb(null)
      return
    }
    try {
      this.isClosed = true
      this.db.close()
      if (cb) cb(null)
    } catch (e) {
      logger.error({ err: e }, 'Error during database close')
      if (cb) cb(e as Error)
    }
  }

  public isClosedCheck(): boolean {
    return this.isClosed
  }

  private executeAndFinalize(
    query: string,
    params: BindableValue[] | undefined,
    operation: 'run' | 'get' | 'all'
  ): unknown {
    const stmt = this.db.prepare(query)
    let result: unknown
    if (operation === 'run') {
      if (params && params.length > 0) {
        stmt.run(...params)
      } else {
        stmt.run()
      }
      result = null
    } else if (operation === 'get') {
      if (params && params.length > 0) {
        result = stmt.get(...params)
      } else {
        result = stmt.get()
      }
    } else {
      if (params && params.length > 0) {
        result = stmt.all(...params)
      } else {
        result = stmt.all()
      }
    }
    return result
  }

  public run(
    query: string,
    params?: unknown[] | ((err: Error | null) => void),
    cb?: (err: Error | null) => void,
    _options?: { skipSave?: boolean }
  ) {
    if (this.isClosed) {
      if (cb) cb(new Error('Database is closed'))
      return
    }
    if (typeof params === 'function') {
      cb = params as (err: Error | null) => void
      params = []
    }
    try {
      const bindableParams =
        params && Array.isArray(params) && params.length > 0
          ? (params as BindableValue[])
          : undefined
      this.executeAndFinalize(query, bindableParams, 'run')
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
    if (this.isClosed) {
      if (cb) cb(new Error('Database is closed'), null as unknown as T)
      return
    }
    if (typeof params === 'function') {
      cb = params as (err: Error | null, row: T) => void
      params = []
    }
    try {
      const bindableParams =
        params && Array.isArray(params) && params.length > 0
          ? (params as BindableValue[])
          : undefined
      const res = this.executeAndFinalize(query, bindableParams, 'get')
      if (cb) cb(null, res as unknown as T)
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
    if (this.isClosed) {
      if (cb) cb(new Error('Database is closed'), [])
      return
    }
    if (typeof params === 'function') {
      cb = params as (err: Error | null, rows: T[]) => void
      params = []
    }
    try {
      const bindableParams =
        params && Array.isArray(params) && params.length > 0
          ? (params as BindableValue[])
          : undefined
      const res = this.executeAndFinalize(query, bindableParams, 'all') as T[]
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
      all: <T = unknown>(): T[] => {
        return stmt.all() as T[]
      },
      get: <T = unknown>(): T | undefined => {
        return stmt.get() as T | undefined
      },
      finalize: () => {},
      runAsync: (cb: (err: Error | null) => void) => {
        try {
          stmt.run()
          cb(null)
        } catch (e) {
          cb(e as Error)
        }
      },
    }
  }

  public backup(backupPath: string) {
    try {
      this.db.exec(`VACUUM INTO '${backupPath}'`)
    } catch (e) {
      logger.error({ err: e, backupPath }, 'Database backup failed via VACUUM INTO')
      throw e
    }
  }
}
