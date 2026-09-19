import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient, type Client } from '@libsql/client'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import {
   applyLibsqlMigrations,
   type LibsqlMigration,
   type LibsqlMigrationClient,
} from '../src/runtime/server/utils/libsql-migrations'

const temporaryDirs: string[] = []
const clients: Client[] = []

function openClient(path: string): Client {
   const client = createClient({ url: `file:${path}` })
   clients.push(client)
   return client
}

async function makeClient(): Promise<Client> {
   const dir = await mkdtemp(join(tmpdir(), 'nuxt-cms-libsql-migrations-'))
   temporaryDirs.push(dir)
   return openClient(join(dir, 'cms.db'))
}

function asMigrationClient(client: Client): LibsqlMigrationClient {
   return client as unknown as LibsqlMigrationClient
}

function migration(folderMillis: number, sql: string[]): LibsqlMigration {
   return { sql, folderMillis, hash: `hash-${folderMillis}` }
}

function tableMigration(folderMillis: number, count: number): LibsqlMigration {
   return migration(
      folderMillis,
      Array.from(
         { length: count },
         (_, index) => `CREATE TABLE t_${folderMillis}_${index} (id integer PRIMARY KEY)`
      )
   )
}

async function tableNames(client: Client): Promise<string[]> {
   const { rows } = await client.execute(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 't\\_%' ESCAPE '\\' ORDER BY name`
   )
   return rows.map((row) => String(row.name))
}

async function appliedRows(client: Client): Promise<{ hash: string; createdAt: number }[]> {
   const { rows } = await client.execute(
      'SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at'
   )
   return rows.map((row) => ({ hash: String(row.hash), createdAt: Number(row.created_at) }))
}

afterEach(() => {
   vi.restoreAllMocks()
   for (const client of clients.splice(0)) client.close()
})

afterAll(async () => {
   await Promise.all(temporaryDirs.map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('applyLibsqlMigrations', () => {
   it('applies a large migration in one batch without an interactive transaction', async () => {
      const client = await makeClient()
      const batch = vi.spyOn(client, 'batch')
      const transaction = vi.spyOn(client, 'transaction')

      const applied = await applyLibsqlMigrations(asMigrationClient(client), [
         tableMigration(1000, 250),
      ])

      expect(applied).toBe(1)
      expect(batch).toHaveBeenCalledTimes(1)
      expect(batch.mock.calls[0]![0]).toHaveLength(251)
      expect(batch.mock.calls[0]![1]).toBe('write')
      expect(transaction).not.toHaveBeenCalled()
      expect(await tableNames(client)).toHaveLength(250)
      expect(await appliedRows(client)).toEqual([{ hash: 'hash-1000', createdAt: 1000 }])
   })

   it('applies nothing on a second run', async () => {
      const client = await makeClient()
      const migrations = [tableMigration(1000, 3), tableMigration(2000, 2)]
      await applyLibsqlMigrations(asMigrationClient(client), migrations)
      const batch = vi.spyOn(client, 'batch')

      const applied = await applyLibsqlMigrations(asMigrationClient(client), migrations)

      expect(applied).toBe(0)
      expect(batch).not.toHaveBeenCalled()
      expect(await tableNames(client)).toHaveLength(5)
      expect(await appliedRows(client)).toHaveLength(2)
   })

   it('runs only the migrations newer than the last applied one', async () => {
      const client = await makeClient()
      await applyLibsqlMigrations(asMigrationClient(client), [tableMigration(1000, 2)])
      const batch = vi.spyOn(client, 'batch')

      const applied = await applyLibsqlMigrations(asMigrationClient(client), [
         tableMigration(1000, 2),
         tableMigration(2000, 3),
         tableMigration(3000, 1),
      ])

      expect(applied).toBe(2)
      expect(batch).toHaveBeenCalledTimes(1)
      expect(batch.mock.calls[0]![0]).toHaveLength(6)
      expect(await tableNames(client)).toHaveLength(6)
      expect(await appliedRows(client)).toEqual([
         { hash: 'hash-1000', createdAt: 1000 },
         { hash: 'hash-2000', createdAt: 2000 },
         { hash: 'hash-3000', createdAt: 3000 },
      ])
   })

   it('leaves the database unchanged when a statement fails', async () => {
      const client = await makeClient()
      await applyLibsqlMigrations(asMigrationClient(client), [tableMigration(1000, 1)])

      await expect(
         applyLibsqlMigrations(asMigrationClient(client), [
            tableMigration(1000, 1),
            tableMigration(2000, 2),
            migration(3000, ['CREATE TABLE t_ok (id integer)', 'NOT VALID SQL']),
         ])
      ).rejects.toThrow()

      expect(await tableNames(client)).toEqual(['t_1000_0'])
      expect(await appliedRows(client)).toEqual([{ hash: 'hash-1000', createdAt: 1000 }])
   })

   it('continues when a concurrent run already applied the migrations', async () => {
      const client = await makeClient()
      const racing = openClient(join(temporaryDirs.at(-1)!, 'cms.db'))
      const migrations = [tableMigration(1000, 2), tableMigration(2000, 2)]
      const originalBatch = client.batch.bind(client)
      vi.spyOn(client, 'batch').mockImplementationOnce(async (statements, mode) => {
         await applyLibsqlMigrations(asMigrationClient(racing), migrations)
         return originalBatch(statements, mode)
      })

      const applied = await applyLibsqlMigrations(asMigrationClient(client), migrations)

      expect(applied).toBe(0)
      expect(await tableNames(client)).toHaveLength(4)
      expect(await appliedRows(client)).toHaveLength(2)
   })

   it('rethrows when the migrations are still missing after a failure', async () => {
      const client = await makeClient()
      await client.execute('CREATE TABLE t_1000_0 (id integer)')

      await expect(
         applyLibsqlMigrations(asMigrationClient(client), [tableMigration(1000, 2)])
      ).rejects.toThrow(/already exists/)
      expect(await appliedRows(client)).toEqual([])
   })
})

describe('createCmsSeeder libsql migrate', () => {
   it('applies a migrations folder in one batch', async () => {
      const root = await mkdtemp(join(tmpdir(), 'nuxt-cms-libsql-seeder-'))
      temporaryDirs.push(root)
      const migrationsDir = join(root, 'migrations')
      await mkdir(join(migrationsDir, 'meta'), { recursive: true })
      const statements = Array.from(
         { length: 210 },
         (_, index) => `CREATE TABLE t_seed_${index} (id integer PRIMARY KEY);`
      )
      await writeFile(
         join(migrationsDir, '0000_init.sql'),
         statements.join('\n--> statement-breakpoint\n')
      )
      await writeFile(
         join(migrationsDir, 'meta/_journal.json'),
         JSON.stringify({
            version: '7',
            dialect: 'sqlite',
            entries: [{ idx: 0, version: '6', when: 1000, tag: '0000_init', breakpoints: true }],
         })
      )
      const { createCmsSeeder } = await import('../src/runtime/seed')
      const seeder = await createCmsSeeder({
         driver: 'libsql',
         url: `file:${join(root, 'cms.db')}`,
         migrationsDir,
         root,
      })
      const client = seeder.db.$client as Client
      clients.push(client)
      const batch = vi.spyOn(client, 'batch')
      const transaction = vi.spyOn(client, 'transaction')

      await seeder.migrate()
      await seeder.migrate()

      expect(batch).toHaveBeenCalledTimes(1)
      expect(transaction).not.toHaveBeenCalled()
      expect(await tableNames(client)).toHaveLength(210)
      expect(await appliedRows(client)).toHaveLength(1)
   })
})
