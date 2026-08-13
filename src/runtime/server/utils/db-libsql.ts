import { createRequire } from 'node:module'
import { createClient } from '@libsql/client/web'
import { drizzle } from 'drizzle-orm/libsql/web'
import { useRuntimeConfig } from '#imports'

let _db: ReturnType<typeof drizzle> | null = null

function createFileDb(url: string, dbPath: string, authToken: string) {
   const require = createRequire(import.meta.url)
   const { mkdirSync } = require('node:fs') as typeof import('node:fs')
   const { dirname } = require('node:path') as typeof import('node:path')
   mkdirSync(dirname(dbPath), { recursive: true })
   const { createClient: createNativeClient } = require('@libsql/client')
   const { drizzle: drizzleNative } = require('drizzle-orm/libsql')
   return drizzleNative(createNativeClient({ url, authToken: authToken || undefined }))
}

export function useDb() {
   if (!_db) {
      const { databaseUrl, databaseAuthToken, dbPath } = useRuntimeConfig().cms as {
         databaseUrl: string
         databaseAuthToken: string
         dbPath: string
      }
      const url = databaseUrl || `file:${dbPath}`
      _db = url.startsWith('file:')
         ? createFileDb(url, dbPath, databaseAuthToken)
         : drizzle(createClient({ url, authToken: databaseAuthToken || undefined }))
   }
   return _db!
}

type Db = ReturnType<typeof useDb>

export type CmsDb = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

export function withTransaction<T>(fn: (db: CmsDb) => Promise<T>): Promise<T> {
   return useDb().transaction((tx) => fn(tx))
}
