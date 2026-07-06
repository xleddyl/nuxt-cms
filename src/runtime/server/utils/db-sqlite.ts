import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { useRuntimeConfig } from '#imports'

let _db: ReturnType<typeof drizzle> | null = null

export function useDb() {
   if (!_db) {
      const { dbPath } = useRuntimeConfig().cms as { dbPath: string }
      mkdirSync(dirname(dbPath), { recursive: true })
      const sqlite = new Database(dbPath)
      sqlite.pragma('journal_mode = WAL')
      sqlite.pragma('foreign_keys = ON')
      _db = drizzle(sqlite)
   }
   return _db
}

export type CmsDb = ReturnType<typeof useDb>

let txQueue: Promise<unknown> = Promise.resolve()

export function withTransaction<T>(fn: (db: CmsDb) => Promise<T>): Promise<T> {
   const db = useDb()
   const run = txQueue.then(async () => {
      await db.run(sql`begin immediate`)
      try {
         const result = await fn(db)
         await db.run(sql`commit`)
         return result
      } catch (error) {
         await db.run(sql`rollback`)
         throw error
      }
   })
   txQueue = run.catch(() => {})
   return run
}
