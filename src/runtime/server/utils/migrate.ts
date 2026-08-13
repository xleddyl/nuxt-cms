import cmsConfig from '#cms-config'
import { migrations as bundledMigrations } from '#cms-migrations'
import { useRuntimeConfig } from '#imports'

export interface CmsMigration {
   sql: string[]
   bps: boolean
   folderMillis: number
   hash: string
}

interface MigratableDb {
   dialect: {
      migrate: (
         migrations: CmsMigration[],
         session: unknown,
         config: { migrationsTable?: string; migrationsSchema?: string }
      ) => unknown
   }
   session: unknown
}

interface D1Statement {
   bind: (...values: unknown[]) => D1Statement
}

interface D1Binding {
   prepare: (query: string) => D1Statement & {
      run: () => Promise<unknown>
      all: <T>() => Promise<{ results: T[] }>
   }
   batch: (statements: D1Statement[]) => Promise<unknown>
}

const MIGRATIONS_TABLE = '__drizzle_migrations'

async function readMigrations(migrationsDir: string): Promise<CmsMigration[]> {
   if (import.meta.dev) {
      const { existsSync } = await import('node:fs')
      if (!existsSync(`${migrationsDir}/meta/_journal.json`)) return []
      const { readMigrationFiles } = await import('drizzle-orm/migrator')
      return readMigrationFiles({ migrationsFolder: migrationsDir }) as CmsMigration[]
   }
   return bundledMigrations
}

async function pendingMigrations(): Promise<CmsMigration[]> {
   const { migrationsDir, migrateOnBoot } = useRuntimeConfig().cms as {
      migrationsDir: string
      migrateOnBoot: boolean
   }
   if (!migrateOnBoot) return []

   const migrations = await readMigrations(migrationsDir)
   if (!migrations.length && Object.keys(cmsConfig).length) {
      console.error(
         `[nuxt-cms] No migrations were found for this build (expected in ${migrationsDir}). CMS tables may be missing — run the dev server once to generate them, commit server/db/migrations, and rebuild.`
      )
   }
   return migrations
}

export async function runCmsMigrations(db: unknown): Promise<void> {
   const migrations = await pendingMigrations()
   if (!migrations.length) return

   const { dialect, session } = db as MigratableDb
   await dialect.migrate(migrations, session, {})
}

export async function runD1Migrations(binding: unknown): Promise<void> {
   const migrations = await pendingMigrations()
   if (!migrations.length) return

   const d1 = binding as D1Binding
   await d1
      .prepare(
         `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)`
      )
      .run()

   const { results } = await d1
      .prepare(`SELECT created_at FROM ${MIGRATIONS_TABLE} ORDER BY created_at DESC LIMIT 1`)
      .all<{ created_at: number | string | null }>()
   const lastApplied = results[0]?.created_at

   const batch: D1Statement[] = []
   for (const migration of migrations) {
      if (lastApplied != null && Number(lastApplied) >= migration.folderMillis) continue
      for (const statement of migration.sql) {
         if (statement.trim()) batch.push(d1.prepare(statement))
      }
      batch.push(
         d1
            .prepare(`INSERT INTO ${MIGRATIONS_TABLE} ("hash", "created_at") VALUES (?, ?)`)
            .bind(migration.hash, migration.folderMillis)
      )
   }
   if (batch.length) await d1.batch(batch)
}
