import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { migrationsDirFor } from './shared/migrations-dir'
import { resolvePageRoutes, routePathsFromDir } from './shared/page-routes'
import type { CmsConfig, CmsPageRoute } from './shared/index'
import { customId, ID_LENGTH } from './server/utils/custom-id'
import { applyLibsqlMigrations } from './server/utils/libsql-migrations'

export { customId, ID_LENGTH }
export type { CmsPageRoute }

export interface ResolveCmsPagesOptions {
   root?: string
   pagesDir?: string
}

export function resolveCmsPages<T extends CmsConfig>(
   config: T,
   options: ResolveCmsPagesOptions = {}
): T {
   const root = options.root ?? process.cwd()
   const pagesDir = options.pagesDir
      ? isAbsolute(options.pagesDir)
         ? options.pagesDir
         : resolve(root, options.pagesDir)
      : resolve(root, 'app/pages')
   const discovered = routePathsFromDir(pagesDir)
   for (const entry of Object.values(config)) {
      if (entry.kind === 'page') entry.pages = resolvePageRoutes(entry, discovered)
   }
   return config
}

export type SeedDriver = 'sqlite' | 'libsql' | 'postgres'

export interface CmsSeederOptions {
   driver?: SeedDriver
   url?: string
   authToken?: string
   dbPath?: string
   migrationsDir?: string
   root?: string
}

function inferDriver(url: string): SeedDriver {
   if (/^(libsql|wss?|https?):\/\//.test(url)) return 'libsql'
   if (/^postgres(ql)?:\/\//.test(url)) return 'postgres'
   return 'sqlite'
}

export async function createCmsSeeder(opts: CmsSeederOptions = {}) {
   const root = opts.root ?? process.cwd()
   const url = opts.url ?? process.env.NUXT_CMS_DATABASE_URL ?? ''
   const authToken = opts.authToken ?? process.env.NUXT_CMS_DATABASE_AUTH_TOKEN ?? ''
   const driver =
      opts.driver ?? (process.env.NUXT_CMS_DATABASE_DRIVER as SeedDriver) ?? inferDriver(url)
   const dbPath = opts.dbPath ?? process.env.NUXT_CMS_DATABASE_PATH ?? 'data/cms.db'
   const resolvedDbPath = isAbsolute(dbPath) ? dbPath : resolve(root, dbPath)
   const migrationsFolder = opts.migrationsDir ?? migrationsDirFor(root, driver)

   if (driver === 'libsql') {
      const { readMigrationFiles } = await import('drizzle-orm/migrator')
      const dbUrl = url || `file:${resolvedDbPath}`
      let db
      if (dbUrl.startsWith('file:')) {
         mkdirSync(dirname(resolvedDbPath), { recursive: true })
         const { createClient } = await import('@libsql/client')
         const { drizzle } = await import('drizzle-orm/libsql')
         db = drizzle(createClient({ url: dbUrl, authToken: authToken || undefined }))
      } else {
         const { createClient } = await import('@libsql/client/web')
         const { drizzle } = await import('drizzle-orm/libsql/web')
         db = drizzle(createClient({ url: dbUrl, authToken: authToken || undefined }))
      }
      const client = db.$client
      return {
         db,
         migrate: async () => {
            await applyLibsqlMigrations(client, readMigrationFiles({ migrationsFolder }))
         },
      }
   }

   if (driver === 'postgres') {
      if (!url) throw new Error('[nuxt-cms] seed: Postgres needs a url (NUXT_CMS_DATABASE_URL)')
      const { drizzle } = await import('drizzle-orm/node-postgres')
      const { migrate } = await import('drizzle-orm/node-postgres/migrator')
      const pg = (await import('pg')).default
      const db = drizzle(new pg.Pool({ connectionString: url }))
      return { db, migrate: () => migrate(db, { migrationsFolder }) }
   }

   const Database = (await import('better-sqlite3')).default
   const { drizzle } = await import('drizzle-orm/better-sqlite3')
   const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
   mkdirSync(dirname(resolvedDbPath), { recursive: true })
   const sqlite = new Database(resolvedDbPath)
   sqlite.pragma('journal_mode = WAL')
   sqlite.pragma('foreign_keys = ON')
   const db = drizzle(sqlite)
   return { db, migrate: () => migrate(db, { migrationsFolder }) }
}
