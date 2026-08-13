import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { afterAll, describe, expect, it } from 'vitest'
import {
   collectMigrations,
   renderMigrationsFile,
   renderMigrationsTypes,
} from '../src/migrations-codegen'

const playgroundMigrations = fileURLToPath(
   new URL('../playground/server/db/migrations/sqlite', import.meta.url)
)

const temporaryDirs: string[] = []

async function makeMigrationsDir(files: Record<string, string>, journal: unknown): Promise<string> {
   const dir = await mkdtemp(join(tmpdir(), 'nuxt-cms-migrations-'))
   temporaryDirs.push(dir)
   await mkdir(join(dir, 'meta'), { recursive: true })
   await writeFile(join(dir, 'meta', '_journal.json'), JSON.stringify(journal))
   for (const [name, contents] of Object.entries(files)) {
      await writeFile(join(dir, name), contents)
   }
   return dir
}

afterAll(async () => {
   await Promise.all(temporaryDirs.map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('collectMigrations', () => {
   it('matches drizzle readMigrationFiles byte for byte', async () => {
      const expected = readMigrationFiles({ migrationsFolder: playgroundMigrations })
      const actual = await collectMigrations(playgroundMigrations)

      expect(actual).not.toBeNull()
      expect(actual!.length).toBeGreaterThan(0)
      expect(actual).toEqual(expected)
   })

   it('keeps the hashes drizzle would have written to __drizzle_migrations', async () => {
      const expected = readMigrationFiles({ migrationsFolder: playgroundMigrations })
      const actual = await collectMigrations(playgroundMigrations)

      expect(actual!.map((m) => m.hash)).toEqual(expected.map((m) => m.hash))
      expect(actual!.map((m) => m.folderMillis)).toEqual(expected.map((m) => m.folderMillis))
   })

   it('returns null when there is no journal', async () => {
      expect(await collectMigrations(join(tmpdir(), 'nuxt-cms-does-not-exist'))).toBeNull()
   })

   it('returns an empty list for an initialised but empty journal', async () => {
      const dir = await makeMigrationsDir({}, { version: '7', dialect: 'sqlite', entries: [] })
      expect(await collectMigrations(dir)).toEqual([])
   })

   it('splits statements on the drizzle breakpoint marker', async () => {
      const dir = await makeMigrationsDir(
         { '0000_test.sql': 'CREATE TABLE a (id text);\n--> statement-breakpoint\nDROP TABLE a;' },
         {
            version: '7',
            dialect: 'sqlite',
            entries: [{ idx: 0, version: '6', when: 42, tag: '0000_test', breakpoints: true }],
         }
      )
      const [migration] = (await collectMigrations(dir))!

      expect(migration!.sql).toEqual(['CREATE TABLE a (id text);\n', '\nDROP TABLE a;'])
      expect(migration!.folderMillis).toBe(42)
      expect(migration!.bps).toBe(true)
   })

   it('follows journal order, not filename order', async () => {
      const dir = await makeMigrationsDir(
         { '0000_a.sql': 'SELECT 1;', '0001_b.sql': 'SELECT 2;' },
         {
            version: '7',
            dialect: 'sqlite',
            entries: [
               { idx: 1, version: '6', when: 2, tag: '0001_b', breakpoints: true },
               { idx: 0, version: '6', when: 1, tag: '0000_a', breakpoints: true },
            ],
         }
      )
      expect((await collectMigrations(dir))!.map((m) => m.folderMillis)).toEqual([2, 1])
   })
})

describe('renderMigrationsFile', () => {
   it('marks the build as generated and inlines the migrations', async () => {
      const migrations = await collectMigrations(playgroundMigrations)
      const rendered = renderMigrationsFile(migrations)

      expect(rendered).toContain('export const generated = true')
      expect(rendered).toContain(migrations![0]!.hash)
   })

   it('emits an empty, non-generated module when there are no migrations', () => {
      const rendered = renderMigrationsFile(null)

      expect(rendered).toContain('export const generated = false')
      expect(rendered).toContain('export const migrations = []')
   })
})

describe('renderMigrationsTypes', () => {
   it('declares the module surface the runtime imports', () => {
      const rendered = renderMigrationsTypes('/abs/path/migrate')

      expect(rendered).toContain("import type { CmsMigration } from '/abs/path/migrate'")
      expect(rendered).toContain('export declare const generated: boolean')
      expect(rendered).toContain('export declare const migrations: CmsMigration[]')
   })
})
