import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { renderGraphqlSdl } from '../src/runtime/shared/graphql-sdl'
import type { CmsConfig, CmsEntry, CmsI18n } from '../src/runtime/shared/index'
import { encodeEntryTranslatableMedia, pageFields } from '../src/runtime/shared/index'
import { resolvePageRoutes } from '../src/runtime/shared/page-routes'
import { buildEntrySchema } from '../src/runtime/shared/validation'
import type { PageDb, PageTables } from '../src/runtime/server/utils/page-rows'
import {
   decodePageRows,
   encodePageRows,
   pageWriteStatements,
   selectPages,
} from '../src/runtime/server/utils/page-rows'
import { renderQueriesFile } from '../src/queries-codegen'
import { renderSchemaFile, validateConfig } from '../src/schema-codegen'
import { renderTypesFile } from '../src/types-codegen'

const I18N: CmsI18n = { locales: ['en', 'it'], defaultLocale: 'en' }
const ROUTES = ['/', '/about', '/contact']
const TMP = join(__dirname, '.tmp')

function pageEntry(storage?: CmsEntry['storage'], columns?: string[]): CmsEntry {
   const entry: CmsEntry = {
      id: 'pages',
      label: 'Pages',
      kind: 'page',
      ...(storage ? { storage } : {}),
      ...(columns ? { columns } : {}),
      fields: {
         metaTitle: { label: 'Meta title', type: 'text', translatable: true },
         ogImage: { label: 'Share image', type: 'media' },
         title: { label: 'Title', type: 'text', translatable: true },
         subtitle: { label: 'Subtitle', type: 'text' },
         count: { label: 'Count', type: 'number', integer: true },
         ratio: { label: 'Ratio', type: 'number' },
         featured: { label: 'Featured', type: 'boolean' },
         published: { label: 'Published', type: 'date' },
         kind: { label: 'Kind', type: 'select', options: ['a', 'b'] },
         tags: { label: 'Tags', type: 'select', options: ['x', 'y', 'z'], multiple: true },
         extra: { label: 'Extra', type: 'json' },
         hero: { label: 'Hero', type: 'media' },
         brochure: { label: 'Brochure', type: 'media', translatable: true },
         gallery: {
            label: 'Gallery',
            type: 'blocks',
            blocks: {
               image: {
                  label: 'Image',
                  fields: {
                     photo: { label: 'Photo', type: 'media', required: true },
                     hidden: { label: 'Hidden', type: 'boolean' },
                     caption: { label: 'Caption', type: 'text', translatable: true },
                  },
               },
               quote: {
                  label: 'Quote',
                  fields: {
                     text: { label: 'Text', type: 'text' },
                     author: { label: 'Author', type: 'text' },
                     cover: { label: 'Cover', type: 'media', translatable: true },
                  },
               },
            },
         },
      },
      overrides: {
         '/about': { intro: { label: 'Intro', type: 'text', textarea: true } },
         '/contact': { subtitle: null },
      },
   }
   entry.pages = resolvePageRoutes(entry, ROUTES)
   return entry
}

const ROWS_COLUMNS = ['metaTitle', 'ogImage']

function rowsConfig(): CmsConfig {
   return { pages: pageEntry('rows', ROWS_COLUMNS) }
}

function columnsConfig(): CmsConfig {
   return { pages: pageEntry() }
}

const VALUES: Record<string, Record<string, unknown>> = {
   '/about': {
      metaTitle: { en: 'About us', it: 'Chi siamo' },
      ogImage: 'share/about.webp',
      title: { en: 'About', it: 'Chi' },
      subtitle: 'A plain string {"not": "json"}',
      count: 7,
      ratio: 1.5,
      featured: false,
      published: '2026-09-19',
      kind: 'b',
      tags: ['x', 'z'],
      extra: { nested: [1, 'two', { three: true }] },
      hero: 'library/hero.webp',
      brochure: { en: 'files/en.pdf', it: 'files/it.pdf' },
      gallery: [
         {
            type: 'image',
            photo: 'library/a.webp',
            hidden: false,
            caption: { en: 'A', it: 'A it' },
         },
         { type: 'quote', text: '42', author: null, cover: { it: 'library/q.webp' } },
         { type: 'image', photo: 'library/b.webp', hidden: true, caption: null },
      ],
      intro: 'Only on the about page',
   },
   '/': {
      metaTitle: null,
      ogImage: null,
      title: { en: 'Home' },
      subtitle: '',
      count: null,
      ratio: null,
      featured: true,
      published: null,
      kind: null,
      tags: [],
      extra: null,
      hero: null,
      brochure: null,
      gallery: null,
   },
   '/contact': {
      metaTitle: { en: 'Contact' },
      ogImage: 'share/contact.webp',
      title: null,
      count: 0,
      gallery: [{ type: 'quote', text: 'hello', author: 'me', cover: null }],
   },
}

function validated(entry: CmsEntry, path: string) {
   const schema = buildEntrySchema({ ...entry, fields: pageFields(entry, path) }, I18N)
   return schema.parse(VALUES[path]) as Record<string, unknown>
}

async function loadSchema(name: string, config: CmsConfig) {
   const file = join(TMP, `${name}.ts`)
   writeFileSync(file, renderSchemaFile(config, 'sqlite'))
   return (await import(file)) as Record<string, unknown>
}

async function createDb(schema: Record<string, unknown>) {
   const { generateSQLiteDrizzleJson, generateSQLiteMigration } = await import('drizzle-kit/api')
   const statements = await generateSQLiteMigration(
      await generateSQLiteDrizzleJson({}),
      await generateSQLiteDrizzleJson(schema)
   )
   const sqlite = new Database(':memory:')
   sqlite.pragma('foreign_keys = ON')
   for (const statement of statements) sqlite.exec(statement)
   let queries: string[] = []
   const db = drizzle(sqlite, { logger: { logQuery: (query) => queries.push(query) } })
   return {
      db,
      sqlite,
      queries: () => queries,
      resetQueries: () => {
         queries = []
      },
   }
}

beforeAll(() => {
   mkdirSync(TMP, { recursive: true })
})

afterAll(() => {
   rmSync(TMP, { recursive: true, force: true })
})

describe('rows storage schema codegen', () => {
   it('keeps the listed columns on the page table and adds the child tables in sqlite', () => {
      const out = renderSchemaFile(rowsConfig(), 'sqlite')
      const page = out.match(/export const pages = sqliteTable\('pages', \{[\s\S]*?\n\}\)/)![0]
      expect(page).toContain("path: text('path').notNull().unique()")
      expect(page).toContain("metaTitle: text('meta_title', { mode: 'json' })")
      expect(page).toContain("ogImage: text('og_image')")
      expect(page).not.toContain('title: ')
      expect(page).not.toContain('gallery')
      expect(page).toContain("updatedAt: text('updated_at')")
      expect(out).toContain(
         [
            "export const pages_fields = sqliteTable('pages_fields', {",
            "  pageId: text('page_id').notNull().references(() => pages.id, { onDelete: 'cascade' }),",
            "  key: text('key').notNull(),",
            "  position: integer('position').notNull().default(0),",
            "  value: text('value').notNull(),",
            '}, table => [primaryKey({ columns: [table.pageId, table.key, table.position] })])',
         ].join('\n')
      )
      expect(out).toContain("export const pages_media = sqliteTable('pages_media', {")
      expect(out).toContain("  mediaKey: text('media_key').notNull(),")
      expect(out).not.toContain('cms_media.key')
      expect(out).toMatch(/import \{ [^}]*\bprimaryKey\b[^}]* \} from 'drizzle-orm\/sqlite-core'/)
   })

   it('renders the same tables for postgres', () => {
      const out = renderSchemaFile(rowsConfig(), 'postgres')
      expect(out).toContain("export const pages = pgTable('pages', {")
      expect(out).toContain("metaTitle: jsonb('meta_title')")
      expect(out).toContain("export const pages_fields = pgTable('pages_fields', {")
      expect(out).toContain("export const pages_media = pgTable('pages_media', {")
      expect(out).toContain("  value: text('value').notNull(),")
      expect(out).toMatch(/import \{ [^}]*\bprimaryKey\b[^}]* \} from 'drizzle-orm\/pg-core'/)
      expect(out).not.toContain("boolean('featured')")
   })

   it('leaves the graphql schema, the types and the queries untouched', () => {
      const rows = rowsConfig()
      const columns = columnsConfig()
      expect(renderGraphqlSdl(rows)).toBe(renderGraphqlSdl(columns))
      expect(renderTypesFile(rows)).toBe(renderTypesFile(columns))
      expect(renderQueriesFile(rows)).toBe(renderQueriesFile(columns))
   })

   it('renders the same schema with storage columns as without storage', () => {
      const explicit: CmsConfig = { pages: pageEntry('columns') }
      for (const dialect of ['sqlite', 'postgres'] as const) {
         expect(renderSchemaFile(explicit, dialect)).toBe(
            renderSchemaFile(columnsConfig(), dialect)
         )
      }
   })
})

describe('rows storage validation', () => {
   const errorsOf = (config: CmsConfig) => validateConfig(config, I18N).join('\n')

   it('accepts a rows entry', () => {
      expect(validateConfig(rowsConfig(), I18N)).toEqual([])
   })

   it('accepts rows without columns', () => {
      expect(validateConfig({ pages: pageEntry('rows') }, I18N)).toEqual([])
   })

   it('rejects an unknown storage', () => {
      expect(errorsOf({ pages: pageEntry('cells' as never) })).toContain(
         "storage must be 'columns' or 'rows'"
      )
   })

   it('rejects columns without storage rows', () => {
      expect(errorsOf({ pages: pageEntry(undefined, ['title']) })).toContain(
         "columns needs storage 'rows'"
      )
   })

   it('rejects a column that only some pages declare', () => {
      expect(errorsOf({ pages: pageEntry('rows', ['intro']) })).toContain(
         "column 'intro': not a field declared for every page"
      )
   })

   it('rejects a column that an override removes', () => {
      expect(errorsOf({ pages: pageEntry('rows', ['subtitle']) })).toContain(
         "column 'subtitle': removed from '/contact'"
      )
   })

   it('rejects an unknown column and a duplicate one', () => {
      const errors = errorsOf({ pages: pageEntry('rows', ['nope', 'title', 'title']) })
      expect(errors).toContain("column 'nope': not a field declared for every page")
      expect(errors).toContain("column 'title': listed more than once")
   })

   it('rejects storage on other kinds', () => {
      const config: CmsConfig = {
         home: {
            id: 'home',
            label: 'Home',
            kind: 'single',
            storage: 'rows',
            fields: { title: { label: 'Title', type: 'text' } },
         },
      }
      expect(errorsOf(config)).toContain("storage and columns need kind 'page'")
   })

   it('asks for relations and slugs to stay columns', () => {
      const entry = pageEntry('rows')
      entry.fields.handle = { label: 'Handle', type: 'slug', from: 'subtitle' }
      entry.fields.owner = { label: 'Owner', type: 'relation', to: 'people' }
      const config: CmsConfig = {
         pages: entry,
         people: {
            id: 'people',
            label: 'People',
            kind: 'collection',
            titleField: 'name',
            fields: { name: { label: 'Name', type: 'text' } },
         },
      }
      const errors = errorsOf(config)
      expect(errors).toContain("field 'handle': slug fields need to be listed in columns")
      expect(errors).toContain("field 'owner': relation fields need to be listed in columns")
      entry.columns = ['handle', 'owner']
      expect(validateConfig(config, I18N)).toEqual([])
   })

   it('rejects many-to-many relations', () => {
      const entry = pageEntry('rows')
      entry.fields.people = {
         label: 'People',
         type: 'relation',
         to: 'people',
         cardinality: 'many-to-many',
      }
      const config: CmsConfig = {
         pages: entry,
         people: {
            id: 'people',
            label: 'People',
            kind: 'collection',
            titleField: 'name',
            fields: { name: { label: 'Name', type: 'text' } },
         },
      }
      expect(errorsOf(config)).toContain('many-to-many relations are not supported')
   })

   it('rejects an entry whose name clashes with a child table', () => {
      const config: CmsConfig = {
         ...rowsConfig(),
         pages_fields: {
            id: 'pagesFields',
            label: 'Clash',
            kind: 'collection',
            titleField: 'name',
            fields: { name: { label: 'Name', type: 'text' } },
         },
      }
      expect(errorsOf(config)).toContain("table name 'pages_fields'")
   })
})

describe('rows storage encoding', () => {
   it('writes one row per scalar, per block subfield and per block type', () => {
      const entry = rowsConfig().pages!
      const encoded = encodePageRows(entry, 'about', {
         ...encodeEntryTranslatableMedia(entry, validated(entry, '/about')),
         updatedAt: 'now',
      })
      expect(Object.keys(encoded.columns)).toEqual(['metaTitle', 'ogImage', 'updatedAt'])
      const field = (key: string, position = 0) =>
         encoded.fields.find((row) => row.key === key && row.position === position)?.value
      const media = (key: string, position = 0) =>
         encoded.media.find((row) => row.key === key && row.position === position)?.mediaKey
      expect(field('title')).toBe('{"en":"About","it":"Chi"}')
      expect(field('subtitle')).toBe('A plain string {"not": "json"}')
      expect(field('count')).toBe('7')
      expect(field('featured')).toBe('false')
      expect(field('tags')).toBe('["x","z"]')
      expect(field('published')).toBe('2026-09-19')
      expect(media('hero')).toBe('library/hero.webp')
      expect(media('brochure')).toBe('{"en":"files/en.pdf","it":"files/it.pdf"}')
      expect(field('gallery._type', 0)).toBe('image')
      expect(field('gallery._type', 1)).toBe('quote')
      expect(field('gallery.text', 1)).toBe('42')
      expect(field('gallery.author', 1)).toBeUndefined()
      expect(media('gallery.photo', 2)).toBe('library/b.webp')
      expect(media('gallery.cover', 1)).toBe('{"it":"library/q.webp"}')
      expect(
         encoded.fields.some((row) => row.key === 'gallery.caption' && row.position === 2)
      ).toBe(false)
      expect(encoded.fieldKeys).toContain('gallery._type')
      expect(encoded.mediaKeys).toEqual(['hero', 'brochure', 'gallery.photo', 'gallery.cover'])
   })
})

describe('rows storage on sqlite', () => {
   let rows: Awaited<ReturnType<typeof createDb>>
   let columns: Awaited<ReturnType<typeof createDb>>
   let rowsTables: PageTables
   let columnsTable: SQLiteTable

   beforeAll(async () => {
      const rowsSchema = await loadSchema('rows-schema', rowsConfig())
      const columnsSchema = await loadSchema('columns-schema', columnsConfig())
      rows = await createDb(rowsSchema)
      columns = await createDb(columnsSchema)
      rowsTables = {
         page: rowsSchema.pages as SQLiteTable,
         fields: rowsSchema.pages_fields as SQLiteTable,
         media: rowsSchema.pages_media as SQLiteTable,
      }
      columnsTable = columnsSchema.pages as SQLiteTable
   })

   afterAll(() => {
      rows?.sqlite.close()
      columns?.sqlite.close()
   })

   async function saveRows(path: string, key: string) {
      const entry = rowsConfig().pages!
      const set = {
         ...encodeEntryTranslatableMedia(entry, validated(entry, path)),
         updatedAt: '2026-09-19 10:00:00',
      }
      const statements = pageWriteStatements(
         rows.db as unknown as PageDb,
         'sqlite',
         rowsTables,
         entry,
         { key, path },
         set
      )
      rows.sqlite.exec('begin')
      const results: unknown[] = []
      for (const statement of statements) results.push(await statement)
      rows.sqlite.exec('commit')
      return { statements: statements.length, saved: results.at(-1) as Record<string, unknown>[] }
   }

   async function saveColumns(path: string, key: string) {
      const entry = columnsConfig().pages!
      const set = {
         ...encodeEntryTranslatableMedia(entry, validated(entry, path)),
         updatedAt: '2026-09-19 10:00:00',
      }
      await columns.db
         .insert(columnsTable)
         .values({ id: key, path, ...set })
         .onConflictDoUpdate({ target: (columnsTable as never as { id: never }).id, set })
   }

   async function readRows(path?: string) {
      const entry = rowsConfig().pages!
      const query = selectPages(rows.db as unknown as PageDb, 'sqlite', rowsTables)
      if (path) query.where(eq((rowsTables.page as never as { path: never }).path, path)).limit(1)
      return decodePageRows(entry, (await query) as Record<string, unknown>[])
   }

   async function readColumns(path?: string) {
      const query = columns.db.select().from(columnsTable).$dynamic()
      if (path) query.where(eq((columnsTable as never as { path: never }).path, path)).limit(1)
      return (await query) as Record<string, unknown>[]
   }

   it('round trips every page to the same flat object as the columns storage', async () => {
      for (const route of rowsConfig().pages!.pages!) {
         await saveRows(route.path, route.key)
         await saveColumns(route.path, route.key)
      }
      for (const route of rowsConfig().pages!.pages!) {
         const [fromRows] = await readRows(route.path)
         const [fromColumns] = await readColumns(route.path)
         expect(fromRows).toEqual(fromColumns)
         expect(Object.keys(fromRows!)).toEqual(Object.keys(fromColumns!))
      }
      expect(await readRows()).toEqual(await readColumns())
   })

   it('reads back the values it wrote', async () => {
      const [about] = await readRows('/about')
      expect(about!.metaTitle).toEqual({ en: 'About us', it: 'Chi siamo' })
      expect(about!.title).toEqual({ en: 'About', it: 'Chi' })
      expect(about!.featured).toBe(false)
      expect(about!.count).toBe(7)
      expect(about!.hero).toBe('library/hero.webp')
      expect(about!.intro).toBe('Only on the about page')
      expect(about!.gallery).toEqual([
         {
            type: 'image',
            photo: 'library/a.webp',
            hidden: false,
            caption: { en: 'A', it: 'A it' },
         },
         { type: 'quote', text: '42', author: null, cover: { it: 'library/q.webp' } },
         { type: 'image', photo: 'library/b.webp', hidden: true, caption: null },
      ])
      const [home] = await readRows('/')
      expect(home!.subtitle).toBe('')
      expect(home!.gallery).toBeNull()
      expect(home!.hero).toBeNull()
      expect(home!.intro).toBeNull()
   })

   it('stores empty fields as no rows', () => {
      const keys = rows.sqlite
         .prepare(`select key from pages_fields where page_id = 'home' order by key`)
         .all()
         .map((row) => (row as { key: string }).key)
      expect(keys).toEqual(['featured', 'subtitle', 'tags', 'title'])
      const media = rows.sqlite
         .prepare(`select count(*) as n from pages_media where page_id = 'home'`)
         .get()
      expect(media).toEqual({ n: 0 })
   })

   it('replaces the rows of the saved fields only', async () => {
      rows.sqlite
         .prepare(
            `insert into pages_fields (page_id, key, position, value) values ('contact', 'intro', 0, 'kept')`
         )
         .run()
      await saveRows('/contact', 'contact')
      const kept = rows.sqlite
         .prepare(`select value from pages_fields where page_id = 'contact' and key = 'intro'`)
         .get()
      expect(kept).toEqual({ value: 'kept' })
      const [contact] = await readRows('/contact')
      expect(contact!.gallery).toEqual([
         { type: 'quote', text: 'hello', author: 'me', cover: null },
      ])
   })

   it('shrinks a blocks field without leaving stale positions', async () => {
      const entry = rowsConfig().pages!
      const set = {
         ...encodeEntryTranslatableMedia(entry, validated(entry, '/about')),
         gallery: [{ type: 'image', photo: 'library/c.webp', hidden: null, caption: null }],
         updatedAt: 'later',
      }
      rows.sqlite.exec('begin')
      for (const statement of pageWriteStatements(
         rows.db as unknown as PageDb,
         'sqlite',
         rowsTables,
         entry,
         { key: 'about', path: '/about' },
         set
      )) {
         await statement
      }
      rows.sqlite.exec('commit')
      const [about] = await readRows('/about')
      expect(about!.gallery).toEqual([
         { type: 'image', photo: 'library/c.webp', hidden: null, caption: null },
      ])
      const count = rows.sqlite
         .prepare(
            `select count(*) as n from pages_media where page_id = 'about' and key like 'gallery.%'`
         )
         .get()
      expect(count).toEqual({ n: 1 })
   })

   it('deletes the child rows with the page', () => {
      rows.sqlite.prepare(`delete from pages where id = 'about'`).run()
      const left = rows.sqlite
         .prepare(
            `select (select count(*) from pages_fields where page_id = 'about') + (select count(*) from pages_media where page_id = 'about') as n`
         )
         .get()
      expect(left).toEqual({ n: 0 })
   })

   it('reads one page with a single statement', async () => {
      await saveRows('/about', 'about')
      rows.resetQueries()
      const [about] = await readRows('/about')
      expect(about!.intro).toBe('Only on the about page')
      expect(rows.queries()).toHaveLength(1)
      expect(rows.queries()[0]).toBe(
         [
            'select "id", "path", "meta_title", "og_image", "updated_at",',
            '(select json_group_array(json_array("pages_fields"."key", "pages_fields"."position", "pages_fields"."value")) from "pages_fields" where "pages_fields"."page_id" = "pages"."id"),',
            '(select json_group_array(json_array("pages_media"."key", "pages_media"."position", "pages_media"."media_key")) from "pages_media" where "pages_media"."page_id" = "pages"."id")',
            'from "pages" where "pages"."path" = ? limit ?',
         ].join(' ')
      )
   })

   it('reads every page with a single statement', async () => {
      rows.resetQueries()
      const all = await readRows()
      expect(all).toHaveLength(3)
      expect(rows.queries()).toHaveLength(1)
   })

   it('writes a page with a fixed set of statements ending in the read', async () => {
      rows.resetQueries()
      const { statements, saved } = await saveRows('/about', 'about')
      expect(rows.queries()).toHaveLength(statements)
      expect(statements).toBe(6)
      expect(rows.queries().at(-1)).toContain('json_group_array')
      expect(decodePageRows(rowsConfig().pages!, saved)[0]!.intro).toBe('Only on the about page')
   })
})

describe('rows storage on libsql', () => {
   it('writes and reads back a page in one batch', async () => {
      const { createClient } = await import('@libsql/client')
      const { drizzle: drizzleLibsql } = await import('drizzle-orm/libsql')
      const { generateSQLiteDrizzleJson, generateSQLiteMigration } = await import('drizzle-kit/api')
      const schema = await loadSchema('libsql-schema', rowsConfig())
      const client = createClient({ url: ':memory:' })
      try {
         for (const statement of await generateSQLiteMigration(
            await generateSQLiteDrizzleJson({}),
            await generateSQLiteDrizzleJson(schema)
         )) {
            await client.execute(statement)
         }
         const db = drizzleLibsql(client)
         const tables = {
            page: schema.pages,
            fields: schema.pages_fields,
            media: schema.pages_media,
         } as unknown as PageTables
         const entry = rowsConfig().pages!
         const set = {
            ...encodeEntryTranslatableMedia(entry, validated(entry, '/about')),
            updatedAt: 'now',
         }
         const statements = pageWriteStatements(
            db as unknown as PageDb,
            'sqlite',
            tables,
            entry,
            { key: 'about', path: '/about' },
            set
         )
         const results = (await db.batch(statements as never)) as unknown[]
         const [about] = decodePageRows(entry, results.at(-1) as Record<string, unknown>[])
         expect(about!.gallery).toEqual(VALUES['/about']!.gallery)
         expect(about!.brochure).toBe('{"en":"files/en.pdf","it":"files/it.pdf"}')
      } finally {
         client.close()
      }
   })
})

describe('rows storage on postgres', () => {
   it('reads one page with a single statement using json_agg', async () => {
      const file = join(TMP, 'pg-schema.ts')
      writeFileSync(file, renderSchemaFile(rowsConfig(), 'postgres'))
      const schema = (await import(file)) as Record<string, unknown>
      {
         const tables = {
            page: schema.pages,
            fields: schema.pages_fields,
            media: schema.pages_media,
         } as unknown as PageTables
         const db = drizzlePg.mock() as unknown as PageDb
         const query = selectPages(db, 'postgres', tables)
            .where(eq((tables.page as never as { path: never }).path, '/about'))
            .limit(1)
         const { sql, params } = query.toSQL()
         expect(sql).toContain(
            `(select coalesce(json_agg(json_build_array("pages_fields"."key", "pages_fields"."position", "pages_fields"."value")), '[]'::json) from "pages_fields" where "pages_fields"."page_id" = "pages"."id")`
         )
         expect(sql).toContain('"pages_media"."media_key"')
         expect(sql.match(/select/g)).toHaveLength(3)
         expect(params).toEqual(['/about', 1])
         expect(
            decodePageRows(rowsConfig().pages!, [
               {
                  id: 'about',
                  path: '/about',
                  metaTitle: null,
                  ogImage: null,
                  updatedAt: 'now',
                  $fields: [
                     ['count', 0, '3'],
                     ['gallery._type', 0, 'image'],
                  ],
                  $media: [['gallery.photo', 0, 'library/a.webp']],
               },
            ])[0]
         ).toMatchObject({
            count: 3,
            gallery: [{ type: 'image', photo: 'library/a.webp', hidden: null, caption: null }],
         })
      }
   })
})
