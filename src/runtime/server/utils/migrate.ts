import { sql } from 'drizzle-orm'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import cmsConfig from '#cms-config'
import { migrations as bundledMigrations } from '#cms-migrations'
import * as cmsTables from '#cms-tables'
import { useRuntimeConfig } from '#imports'
import { applyLibsqlMigrations, type LibsqlMigrationClient } from './libsql-migrations'
import { backfillTimestamps } from './timestamps'

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
         `[nuxt-cms] No migrations were found for this build (expected in ${migrationsDir}). CMS tables may be missing. Run the dev server once to generate them, commit server/db/migrations, and rebuild.`
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

export async function runSqliteMigrations(db: unknown): Promise<void> {
   const migrations = await pendingMigrations()
   if (!migrations.length) return

   const { dialect, session, $client } = db as MigratableDb & {
      $client: { pragma: (source: string) => unknown }
   }
   $client.pragma('foreign_keys = OFF')
   try {
      await dialect.migrate(migrations, session, {})
   } finally {
      $client.pragma('foreign_keys = ON')
   }

   const sqlite = db as BaseSQLiteDatabase<'sync', unknown>
   await backfillTimestamps(cmsTables, {
      select: async (query) => sqlite.all(sql.raw(query)),
      write: async (statements) => {
         for (const statement of statements) sqlite.run(sql.raw(statement))
      },
   })
}

export async function runLibsqlMigrations(db: unknown): Promise<void> {
   const migrations = await pendingMigrations()
   if (!migrations.length) return

   const { $client } = db as { $client: LibsqlMigrationClient }
   await applyLibsqlMigrations($client, migrations)

   await backfillTimestamps(cmsTables, {
      select: async (query) => Array.from((await $client.execute(query)).rows),
      write: (statements) =>
         $client.batch(
            statements.map((statement) => ({ sql: statement, args: [] })),
            'write'
         ),
   })
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

   await backfillTimestamps(cmsTables, {
      select: async (query) => (await d1.prepare(query).all<unknown>()).results,
      write: (statements) => d1.batch(statements.map((statement) => d1.prepare(statement))),
   })
}
