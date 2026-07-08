import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { useRuntimeConfig } from '#imports'

let _db: ReturnType<typeof drizzle> | null = null

export function useDb() {
   if (!_db) {
      const { databaseUrl, databaseAuthToken, dbPath } = useRuntimeConfig().cms as {
         databaseUrl: string
         databaseAuthToken: string
         dbPath: string
      }
      const url = databaseUrl || `file:${dbPath}`
      if (url.startsWith('file:')) mkdirSync(dirname(dbPath), { recursive: true })
      _db = drizzle(createClient({ url, authToken: databaseAuthToken || undefined }))
   }
   return _db
}

type Db = ReturnType<typeof useDb>

export type CmsDb = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

export function withTransaction<T>(fn: (db: CmsDb) => Promise<T>): Promise<T> {
   return useDb().transaction((tx) => fn(tx))
}
