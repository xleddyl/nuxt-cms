import Database from 'better-sqlite3'
import { asc, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'
import type { RebasedMediaRow, WriteDb } from '../src/runtime/server/utils/write-statements'
import {
   chunks,
   joinWriteStatements,
   mediaDeleteStatements,
   mediaFolderRenameStatements,
   planMediaFolderRename,
} from '../src/runtime/server/utils/write-statements'
import { rebaseMediaFolder } from '../src/runtime/shared/index'

const posts = sqliteTable('posts', { id: text('id').primaryKey() })
const tags = sqliteTable('tags', { id: text('id').primaryKey() })
const postsTags = sqliteTable('posts_tags', {
   sourceId: text('source_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
   targetId: text('target_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
   position: integer('position').notNull(),
})
const media = sqliteTable('cms_media', {
   id: integer('id').primaryKey({ autoIncrement: true }),
   key: text('key').notNull().unique(),
   alt: text('alt'),
   folder: text('folder'),
   mime: text('mime'),
   size: integer('size'),
   width: integer('width'),
   height: integer('height'),
   createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
})

const join = {
   table: postsTags,
   sourceId: postsTags.sourceId,
   targetId: postsTags.targetId,
   position: postsTags.position,
}

function setup() {
   const sqlite = new Database(':memory:')
   sqlite.pragma('foreign_keys = ON')
   sqlite.exec(`
      create table posts (id text primary key);
      create table tags (id text primary key);
      create table posts_tags (
         source_id text not null references posts(id) on delete cascade,
         target_id text not null references tags(id) on delete cascade,
         position integer not null
      );
      create table cms_media (
         id integer primary key autoincrement,
         key text not null unique,
         alt text,
         folder text,
         mime text,
         size integer,
         width integer,
         height integer,
         created_at text default (datetime('now')) not null
      );
   `)
   const db = drizzle(sqlite)
   return { sqlite, db, writeDb: db as unknown as WriteDb }
}

function runAtomically(sqlite: InstanceType<typeof Database>, statements: PromiseLike<unknown>[]) {
   return sqlite.transaction(() => {
      for (const statement of statements) (statement as unknown as { run: () => unknown }).run()
   })()
}

function links(db: ReturnType<typeof drizzle>) {
   return db
      .select({ sourceId: postsTags.sourceId, targetId: postsTags.targetId })
      .from(postsTags)
      .orderBy(asc(postsTags.sourceId), asc(postsTags.position))
      .all()
}

function rebase(rows: { key: string; folder: string }[], from: string, to: string) {
   return rows.map(
      (row): RebasedMediaRow => ({ ...row, target: rebaseMediaFolder(row.folder, from, to) })
   )
}

describe('chunks', () => {
   it('splits a list into slices of the given size', () => {
      expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
      expect(chunks([], 2)).toEqual([])
   })
})

describe('joinWriteStatements', () => {
   it('deletes the old links and inserts the new ones in order', () => {
      const { sqlite, db, writeDb } = setup()
      sqlite.exec(
         `insert into posts values ('p1'), ('p2'); insert into tags values ('a'), ('b'), ('c')`
      )
      runAtomically(sqlite, joinWriteStatements(writeDb, join, 'p1', ['a', 'b']))
      runAtomically(sqlite, joinWriteStatements(writeDb, join, 'p2', ['c']))
      runAtomically(sqlite, joinWriteStatements(writeDb, join, 'p1', ['c', 'a']))
      expect(links(db)).toEqual([
         { sourceId: 'p1', targetId: 'c' },
         { sourceId: 'p1', targetId: 'a' },
         { sourceId: 'p2', targetId: 'c' },
      ])
   })

   it('only deletes when the list is empty', () => {
      const { writeDb } = setup()
      expect(joinWriteStatements(writeDb, join, 'p1', [])).toHaveLength(1)
   })

   it('splits large inserts to stay under the bound parameter limit', () => {
      const { sqlite, db, writeDb } = setup()
      const ids = Array.from({ length: 65 }, (_, index) => `t${index}`)
      sqlite.exec(`insert into posts values ('p1')`)
      for (const id of ids) sqlite.prepare('insert into tags values (?)').run(id)
      const statements = joinWriteStatements(writeDb, join, 'p1', ids)
      expect(statements).toHaveLength(4)
      for (const statement of statements.slice(1)) {
         const { params } = (statement as unknown as { toSQL: () => { params: unknown[] } }).toSQL()
         expect(params.length).toBeLessThanOrEqual(100)
      }
      runAtomically(sqlite, statements)
      expect(links(db).map((link) => link.targetId)).toEqual(ids)
   })

   it('leaves the old links in place when a statement fails', () => {
      const { sqlite, db, writeDb } = setup()
      sqlite.exec(`insert into posts values ('p1'); insert into tags values ('a')`)
      runAtomically(sqlite, joinWriteStatements(writeDb, join, 'p1', ['a']))
      expect(() =>
         runAtomically(sqlite, joinWriteStatements(writeDb, join, 'p1', ['missing']))
      ).toThrow()
      expect(links(db)).toEqual([{ sourceId: 'p1', targetId: 'a' }])
   })
})

describe('planMediaFolderRename', () => {
   it('moves file folders shallowest first and replaces the markers', () => {
      const rows = [
         { key: 'blog/covers/b.jpg', folder: 'blog/covers' },
         { key: 'blog/a.jpg', folder: 'blog' },
         { key: 'blog/.keep', folder: 'blog' },
         { key: 'blog/covers/.keep', folder: 'blog/covers' },
         { key: 'blog/empty/.keep', folder: 'blog/empty' },
      ]
      expect(planMediaFolderRename(rebase(rows, 'blog', 'news'))).toEqual({
         folders: [
            ['blog', 'news'],
            ['blog/covers', 'news/covers'],
         ],
         markers: ['news', 'news/covers', 'news/empty'],
         staleMarkers: ['blog/.keep', 'blog/covers/.keep', 'blog/empty/.keep'],
      })
   })

   it('keeps a marker that the rename writes again', () => {
      const rows = [
         { key: 'a/b/b/.keep', folder: 'a/b/b' },
         { key: 'a/b/b/b/.keep', folder: 'a/b/b/b' },
      ]
      const plan = planMediaFolderRename(rebase(rows, 'a/b/b', 'a/b'))
      expect(plan.markers).toEqual(['a/b', 'a/b/b'])
      expect(plan.staleMarkers).toEqual(['a/b/b/b/.keep'])
   })
})

describe('mediaFolderRenameStatements', () => {
   function seed(sqlite: InstanceType<typeof Database>, rows: [string, string][]) {
      const insert = sqlite.prepare('insert into cms_media (key, folder) values (?, ?)')
      for (const [key, folder] of rows) insert.run(key, folder)
   }

   function state(db: ReturnType<typeof drizzle>) {
      return db
         .select({ key: media.key, folder: media.folder })
         .from(media)
         .orderBy(asc(media.key))
         .all()
   }

   it('moves a folder up one level without moving rows twice', () => {
      const { sqlite, db, writeDb } = setup()
      const rows: [string, string][] = [
         ['x.jpg', 'a/b/b'],
         ['y.jpg', 'a/b/b/b'],
         ['a/b/b/.keep', 'a/b/b'],
         ['a/b/b/b/.keep', 'a/b/b/b'],
      ]
      seed(sqlite, rows)
      const plan = planMediaFolderRename(
         rebase(
            rows.map(([key, folder]) => ({ key, folder })),
            'a/b/b',
            'a/b'
         )
      )
      runAtomically(sqlite, mediaFolderRenameStatements(writeDb, media, plan))
      expect(state(db)).toEqual([
         { key: 'a/b/.keep', folder: 'a/b' },
         { key: 'a/b/b/.keep', folder: 'a/b/b' },
         { key: 'x.jpg', folder: 'a/b' },
         { key: 'y.jpg', folder: 'a/b/b' },
      ])
   })

   it('rolls back every row when a statement fails', () => {
      const { sqlite, db, writeDb } = setup()
      const rows: [string, string][] = [
         ['x.jpg', 'blog'],
         ['blog/.keep', 'blog'],
      ]
      seed(sqlite, rows)
      sqlite.exec(
         `create trigger fail before delete on cms_media begin select raise(abort, 'boom'); end`
      )
      const plan = planMediaFolderRename(
         rebase(
            rows.map(([key, folder]) => ({ key, folder })),
            'blog',
            'news'
         )
      )
      expect(() =>
         runAtomically(sqlite, mediaFolderRenameStatements(writeDb, media, plan))
      ).toThrow('boom')
      expect(state(db)).toEqual([
         { key: 'blog/.keep', folder: 'blog' },
         { key: 'x.jpg', folder: 'blog' },
      ])
   })
})

describe('mediaFolderRenameStatements timestamps', () => {
   it('writes ISO created_at on new markers and keeps it on existing ones', () => {
      const { sqlite, db, writeDb } = setup()
      sqlite
         .prepare('insert into cms_media (key, folder, created_at) values (?, ?, ?)')
         .run('news/.keep', 'news', '2026-01-01T00:00:00.000Z')
      runAtomically(
         sqlite,
         mediaFolderRenameStatements(writeDb, media, {
            folders: [],
            markers: ['news', 'blog'],
            staleMarkers: [],
         })
      )
      const rows = db
         .select({ key: media.key, createdAt: media.createdAt })
         .from(media)
         .orderBy(asc(media.key))
         .all()
      expect(rows[0]!.key).toBe('blog/.keep')
      expect(rows[0]!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(rows[1]).toEqual({ key: 'news/.keep', createdAt: '2026-01-01T00:00:00.000Z' })
   })
})

describe('mediaDeleteStatements', () => {
   it('deletes the keys in chunks', () => {
      const { sqlite, db, writeDb } = setup()
      const keys = Array.from({ length: 95 }, (_, index) => `k${index}.jpg`)
      const insert = sqlite.prepare('insert into cms_media (key) values (?)')
      for (const key of [...keys, 'keep.jpg']) insert.run(key)
      const statements = mediaDeleteStatements(writeDb, media, keys)
      expect(statements).toHaveLength(2)
      runAtomically(sqlite, statements)
      expect(
         db
            .select({ count: sql<number>`count(*)` })
            .from(media)
            .get()
      ).toEqual({ count: 1 })
   })
})
