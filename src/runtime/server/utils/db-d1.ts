import { drizzle } from 'drizzle-orm/d1'
import { useRuntimeConfig } from '#imports'

export type D1Binding = Parameters<typeof drizzle>[0]

let _env: Record<string, unknown> | null = null
let _db: ReturnType<typeof drizzle> | null = null

export function setD1Env(env: Record<string, unknown>) {
   if (_env === env) return
   _env = env
   _db = null
}

export function useD1Binding(): D1Binding {
   const { d1Binding } = useRuntimeConfig().cms as { d1Binding: string }
   const binding = _env?.[d1Binding]
   if (!binding) {
      throw new Error(
         `[nuxt-cms] D1 binding '${d1Binding}' was not found on the Cloudflare environment. Declare it in wrangler.toml (or set cms.database.binding to the name you used).`
      )
   }
   return binding as D1Binding
}

export function useDb() {
   if (!_db) _db = drizzle(useD1Binding())
   return _db
}

type Db = ReturnType<typeof useDb>

export type CmsDb = Db

export function withTransaction<T>(fn: (db: CmsDb) => Promise<T>): Promise<T> {
   return fn(useDb())
}
