import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { useRuntimeConfig } from '#imports'

let _db: ReturnType<typeof drizzle> | null = null

export function useDb() {
   if (!_db) {
      const { databaseUrl, poolMax } = useRuntimeConfig().cms as {
         databaseUrl: string
         poolMax: number
      }
      if (!databaseUrl) {
         throw new Error(
            '[nuxt-cms] Missing Postgres connection string: set NUXT_CMS_DATABASE_URL or cms.database.url'
         )
      }
      _db = drizzle(
         new pg.Pool({ connectionString: databaseUrl, ...(poolMax > 0 ? { max: poolMax } : {}) })
      )
   }
   return _db
}

type Db = ReturnType<typeof useDb>

export type CmsDb = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

export const cmsDialect: 'sqlite' | 'postgres' = 'postgres'

export function withTransaction<T>(fn: (db: CmsDb) => Promise<T>): Promise<T> {
   return useDb().transaction((tx) => fn(tx))
}

export function runBatch(build: (db: CmsDb) => PromiseLike<unknown>[]): Promise<unknown[]> {
   return withTransaction(async (db) => {
      const results: unknown[] = []
      for (const statement of build(db)) results.push(await statement)
      return results
   })
}
