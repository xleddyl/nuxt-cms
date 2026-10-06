import Database from 'better-sqlite3'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { pgTable, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import {
   normalizeTimestamp,
   normalizeTimestampFields,
   nowTimestamp,
} from '../src/runtime/shared/timestamps'
import {
   backfillTimestamps,
   timestampBackfillStatement,
   timestampColumns,
   timestampProbeQuery,
} from '../src/runtime/server/utils/timestamps'

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe('normalizeTimestamp', () => {
   it('keeps ISO values from toISOString unchanged', () => {
      const iso = new Date(Date.UTC(2026, 9, 6, 12, 30, 15, 42)).toISOString()
      expect(normalizeTimestamp(iso)).toBe(iso)
   })

   it('reads the legacy sqlite format as UTC', () => {
      expect(normalizeTimestamp('2026-10-06 12:30:15')).toBe('2026-10-06T12:30:15.000Z')
   })

   it('turns postgres timestamp strings into ISO with milliseconds', () => {
      expect(normalizeTimestamp('2026-10-06 12:30:15.123456')).toBe('2026-10-06T12:30:15.123Z')
      expect(normalizeTimestamp('2026-10-06 12:30:15.5')).toBe('2026-10-06T12:30:15.500Z')
      expect(normalizeTimestamp('2026-10-06 14:30:15.5+02')).toBe('2026-10-06T12:30:15.500Z')
      expect(normalizeTimestamp('2026-10-06 14:30:15+02:00')).toBe('2026-10-06T12:30:15.000Z')
   })

   it('serializes Date objects', () => {
      expect(normalizeTimestamp(new Date(Date.UTC(2026, 0, 2, 3, 4, 5, 6)))).toBe(
         '2026-01-02T03:04:05.006Z'
      )
   })

   it('leaves other values alone', () => {
      expect(normalizeTimestamp(null)).toBeNull()
      expect(normalizeTimestamp(undefined)).toBeUndefined()
      expect(normalizeTimestamp('not a date')).toBe('not a date')
      expect(normalizeTimestamp('2026-10-06')).toBe('2026-10-06')
   })

   it('writes the current time as ISO', () => {
      const now = nowTimestamp()
      expect(now).toMatch(ISO)
      expect(Math.abs(Date.parse(now) - Date.now())).toBeLessThan(60_000)
   })

   it('normalizes createdAt and updatedAt on a row only', () => {
      const row = { createdAt: '2026-10-06 12:00:00', updatedAt: null, date: '2026-10-06 12:00:00' }
      expect(normalizeTimestampFields(row)).toEqual({
         createdAt: '2026-10-06T12:00:00.000Z',
         updatedAt: null,
         date: '2026-10-06 12:00:00',
      })
   })
})

const legacyDefault = sql`(datetime('now'))`

const posts = sqliteTable('posts', {
   id: text('id').primaryKey(),
   title: text('title'),
   createdAt: text('created_at').notNull().default(legacyDefault),
   updatedAt: text('updated_at').notNull().default(legacyDefault),
})

const media = sqliteTable('cms_media', {
   id: integer('id').primaryKey({ autoIncrement: true }),
   key: text('key').notNull(),
   createdAt: text('created_at').notNull().default(legacyDefault),
})

const pgPosts = pgTable('pg_posts', {
   createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
})

describe('backfillTimestamps', () => {
   const databases: Database.Database[] = []

   afterEach(() => {
      for (const db of databases.splice(0)) db.close()
   })

   function open() {
      const db = new Database(':memory:')
      databases.push(db)
      db.exec(`
         CREATE TABLE posts (
            id text PRIMARY KEY,
            title text,
            created_at text DEFAULT (datetime('now')) NOT NULL,
            updated_at text DEFAULT (datetime('now')) NOT NULL
         );
         CREATE TABLE cms_media (
            id integer PRIMARY KEY AUTOINCREMENT,
            key text NOT NULL,
            created_at text DEFAULT (datetime('now')) NOT NULL
         );
      `)
      return db
   }

   function driver(db: Database.Database) {
      const calls = { selects: 0, writes: [] as string[] }
      return {
         calls,
         select: async (query: string) => {
            calls.selects += 1
            return db.prepare(query).all()
         },
         write: async (statements: string[]) => {
            calls.writes.push(...statements)
            for (const statement of statements) db.exec(statement)
         },
      }
   }

   it('finds created_at and updated_at on sqlite tables only', () => {
      expect(timestampColumns({ posts, media, pgPosts, other: 42 })).toEqual([
         { table: 'posts', column: 'created_at' },
         { table: 'posts', column: 'updated_at' },
         { table: 'cms_media', column: 'created_at' },
      ])
      expect(timestampBackfillStatement({ table: 'posts', column: 'created_at' })).toBe(
         `UPDATE "posts" SET "created_at" = strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") WHERE "created_at" NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS NOT NULL`
      )
      expect(timestampProbeQuery(timestampColumns({ posts }))).toBe(
         [
            `SELECT 0 AS target WHERE EXISTS (SELECT 1 FROM "posts" WHERE "created_at" NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS NOT NULL)`,
            `SELECT 1 AS target WHERE EXISTS (SELECT 1 FROM "posts" WHERE "updated_at" NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at") IS NOT NULL)`,
         ].join(' UNION ALL ')
      )
   })

   it('rewrites legacy rows to ISO and keeps ISO rows and odd values untouched', async () => {
      const db = open()
      db.exec(`
         INSERT INTO posts (id, title, created_at, updated_at) VALUES
            ('old', 'a', '2026-10-06 08:15:30', '2026-10-06 08:15:30'),
            ('mixed', 'b', '2026-10-06 08:15:30', '2026-10-06T09:00:00.250Z'),
            ('iso', 'c', '2026-10-05T23:59:59.999Z', '2026-10-06T10:00:00.000Z'),
            ('odd', 'd', 'yesterday', '2026-10-06T10:00:00.000Z');
         INSERT INTO cms_media (key) VALUES ('photo.jpg');
      `)
      const first = driver(db)

      expect(await backfillTimestamps({ posts, media }, first)).toBe(3)
      expect(first.calls.selects).toBe(1)
      expect(first.calls.writes).toHaveLength(3)

      const rows = db.prepare('SELECT id, created_at, updated_at FROM posts ORDER BY id').all()
      expect(rows).toEqual([
         {
            id: 'iso',
            created_at: '2026-10-05T23:59:59.999Z',
            updated_at: '2026-10-06T10:00:00.000Z',
         },
         {
            id: 'mixed',
            created_at: '2026-10-06T08:15:30.000Z',
            updated_at: '2026-10-06T09:00:00.250Z',
         },
         { id: 'odd', created_at: 'yesterday', updated_at: '2026-10-06T10:00:00.000Z' },
         {
            id: 'old',
            created_at: '2026-10-06T08:15:30.000Z',
            updated_at: '2026-10-06T08:15:30.000Z',
         },
      ])
      const [file] = db.prepare('SELECT created_at FROM cms_media').all() as {
         created_at: string
      }[]
      expect(file!.created_at).toMatch(ISO)
   })

   it('runs only the read-only probe when nothing needs converting', async () => {
      const db = open()
      db.exec(`
         INSERT INTO posts (id, created_at, updated_at) VALUES
            ('iso', '2026-10-05T23:59:59.999Z', '2026-10-06T10:00:00.000Z');
      `)
      const second = driver(db)

      expect(await backfillTimestamps({ posts, media }, second)).toBe(0)
      expect(second.calls.selects).toBe(1)
      expect(second.calls.writes).toEqual([])
   })

   it('updates only the columns that still hold legacy values', async () => {
      const db = open()
      db.exec(`
         INSERT INTO posts (id, created_at, updated_at) VALUES
            ('a', '2026-10-06 08:15:30', '2026-10-06T10:00:00.000Z');
      `)
      const partial = driver(db)

      expect(await backfillTimestamps({ posts, media }, partial)).toBe(1)
      expect(partial.calls.writes).toEqual([
         timestampBackfillStatement({ table: 'posts', column: 'created_at' }),
      ])
   })

   it('skips the probe when no table has timestamps', async () => {
      const db = open()
      const none = driver(db)
      expect(await backfillTimestamps({ pgPosts }, none)).toBe(0)
      expect(none.calls.selects).toBe(0)
   })
})
