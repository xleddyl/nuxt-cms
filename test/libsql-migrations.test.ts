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
   it('applies a large migration in one call without an interactive transaction', async () => {
      const client = await makeClient()
      const migrate = vi.spyOn(client, 'migrate')
      const transaction = vi.spyOn(client, 'transaction')

      const applied = await applyLibsqlMigrations(asMigrationClient(client), [
         tableMigration(1000, 250),
      ])

      expect(applied).toBe(1)
      expect(migrate).toHaveBeenCalledTimes(1)
      expect(migrate.mock.calls[0]![0]).toHaveLength(251)
      expect(transaction).not.toHaveBeenCalled()
      expect(await tableNames(client)).toHaveLength(250)
      expect(await appliedRows(client)).toEqual([{ hash: 'hash-1000', createdAt: 1000 }])
   })

   it('applies nothing on a second run', async () => {
      const client = await makeClient()
      const migrations = [tableMigration(1000, 3), tableMigration(2000, 2)]
      await applyLibsqlMigrations(asMigrationClient(client), migrations)
      const migrate = vi.spyOn(client, 'migrate')

      const applied = await applyLibsqlMigrations(asMigrationClient(client), migrations)

      expect(applied).toBe(0)
      expect(migrate).not.toHaveBeenCalled()
      expect(await tableNames(client)).toHaveLength(5)
      expect(await appliedRows(client)).toHaveLength(2)
   })

   it('runs only the migrations newer than the last applied one', async () => {
      const client = await makeClient()
      await applyLibsqlMigrations(asMigrationClient(client), [tableMigration(1000, 2)])
      const migrate = vi.spyOn(client, 'migrate')

      const applied = await applyLibsqlMigrations(asMigrationClient(client), [
         tableMigration(1000, 2),
         tableMigration(2000, 3),
         tableMigration(3000, 1),
      ])

      expect(applied).toBe(2)
      expect(migrate).toHaveBeenCalledTimes(1)
      expect(migrate.mock.calls[0]![0]).toHaveLength(6)
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
      const originalMigrate = client.migrate.bind(client)
      vi.spyOn(client, 'migrate').mockImplementationOnce(async (statements) => {
         await applyLibsqlMigrations(asMigrationClient(racing), migrations)
         return originalMigrate(statements)
      })

      const applied = await applyLibsqlMigrations(asMigrationClient(client), migrations)

      expect(applied).toBe(0)
      expect(await tableNames(client)).toHaveLength(4)
      expect(await appliedRows(client)).toHaveLength(2)
   })

   it('rebuilds a referenced table without cascading into its children', async () => {
      const client = await makeClient()
      await applyLibsqlMigrations(asMigrationClient(client), [
         migration(1000, [
            "CREATE TABLE t_parent (id text PRIMARY KEY, created_at text DEFAULT (datetime('now')) NOT NULL)",
            'CREATE TABLE t_child (parent_id text NOT NULL REFERENCES t_parent(id) ON DELETE cascade)',
         ]),
      ])
      await client.execute("INSERT INTO t_parent (id) VALUES ('a')")
      await client.execute("INSERT INTO t_child (parent_id) VALUES ('a')")

      await applyLibsqlMigrations(asMigrationClient(client), [
         migration(2000, [
            "CREATE TABLE t_new_parent (id text PRIMARY KEY, created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL)",
            'INSERT INTO t_new_parent (id, created_at) SELECT id, created_at FROM t_parent',
            'DROP TABLE t_parent',
            'ALTER TABLE t_new_parent RENAME TO t_parent',
         ]),
      ])

      const { rows } = await client.execute('SELECT parent_id FROM t_child')
      expect(rows.map((row) => row.parent_id)).toEqual(['a'])
      expect((await client.execute('PRAGMA foreign_keys')).rows[0]?.[0]).toBe(1)
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
      const migrate = vi.spyOn(client, 'migrate')
      const transaction = vi.spyOn(client, 'transaction')

      await seeder.migrate()
      await seeder.migrate()

      expect(migrate).toHaveBeenCalledTimes(1)
      expect(transaction).not.toHaveBeenCalled()
      expect(await tableNames(client)).toHaveLength(210)
      expect(await appliedRows(client)).toHaveLength(1)
   })
})
