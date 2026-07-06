import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { useRuntimeConfig } from '#imports'

let _db: ReturnType<typeof drizzle> | null = null

export function useDb() {
   if (!_db) {
      const { databaseUrl } = useRuntimeConfig().cms as { databaseUrl: string }
      if (!databaseUrl) {
         throw new Error(
            '[nuxt-cms] Missing Postgres connection string: set NUXT_CMS_DATABASE_URL or cms.database.url'
         )
      }
      _db = drizzle(new pg.Pool({ connectionString: databaseUrl }))
   }
   return _db
}
