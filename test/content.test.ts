import Database from 'better-sqlite3'
import { and, asc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { buildSchema, parse, validate } from 'graphql'
import { describe, expect, it } from 'vitest'
import { contentItemQuery, contentListQuery, renderQueriesFile } from '../src/queries-codegen'
import { renderSchemaFile, validateConfig } from '../src/schema-codegen'
import { renderTypesFile } from '../src/types-codegen'
import { renderGraphqlSdl } from '../src/runtime/shared/graphql-sdl'
import type { CmsConfig, CmsEntry } from '../src/runtime/shared/index'
import {
   CONTENT_SYSTEM_FIELDS,
   defineCmsBlocks,
   defineCmsConfig,
   isScheduledContent,
   normalizeCmsConfig,
   slugSourceValue,
} from '../src/runtime/shared/index'
import { buildEntrySchema } from '../src/runtime/shared/validation'
import { visibilityConditions } from '../src/runtime/server/utils/visibility'
import { I18N, contentConfig } from './fixtures'

function normalized(config: CmsConfig = contentConfig()) {
   return normalizeCmsConfig(config, I18N)
}

describe('content normalization', () => {
   it('injects the system fields around the declared ones', () => {
      const news = normalized().news!
      expect(Object.keys(news.fields)).toEqual([
         'title',
         'slug',
         'publishedAt',
         'excerpt',
         'cover',
         'category',
         'featured',
         'body',
         'seoTitle',
         'seoDescription',
         'seoImage',
      ])
      expect(news.titleField).toBe('title')
      expect(news.drafts).toBe(true)
      expect(news.list).toEqual({ columns: ['title', 'status', 'publishedAt'] })
   })

   it('builds the body from the blocks and applies label overrides', () => {
      const news = normalized().news!
      expect(news.fields.body!.type).toBe('blocks')
      expect(Object.keys(news.fields.body!.blocks!)).toEqual(['text', 'image'])
      expect(news.fields.excerpt!.label).toBe('Summary')
      expect(news.fields.title!.label).toBe('Title')
   })

   it('makes the text system fields translatable only when locales exist', () => {
      expect(normalized().news!.fields.title!.translatable).toBe(true)
      const plain = normalizeCmsConfig(contentConfig(), { locales: [] }).news!
      expect(plain.fields.title!.translatable).toBeUndefined()
      expect(plain.fields.slug!.from).toBe('title')
   })

   it('stores publishedAt as a datetime field and is idempotent', () => {
      const config = normalized()
      const keys = Object.keys(config.news!.fields)
      normalizeCmsConfig(config, I18N)
      expect(Object.keys(config.news!.fields)).toEqual(keys)
      expect(config.news!.declared!.fields).toEqual(['category', 'featured'])
      expect(config.news!.fields.publishedAt!.type).toBe('datetime')
   })

   it('keeps literal types through defineCmsBlocks', () => {
      const blocks = defineCmsBlocks({
         text: {
            label: 'Text',
            component: 'SectionText',
            fields: { body: { label: 'Body', type: 'text' } },
         },
      })
      const config = defineCmsConfig({
         news: { id: 'news', label: 'News', kind: 'content', blocks },
         blog: { id: 'blog', label: 'Blog', kind: 'content', blocks },
      })
      const type: 'text' = config.news.blocks.text.fields.body.type
      expect(type).toBe('text')
   })
})

describe('content validation', () => {
   it('accepts a well-formed content entry', () => {
      expect(validateConfig(contentConfig(), I18N)).toEqual([])
   })

   it('rejects a declared system field', () => {
      const config = contentConfig()
      config.news!.fields.title = { label: 'Title', type: 'text' }
      config.news!.fields.seoImage = { label: 'Image', type: 'media' }
      const errors = validateConfig(config, I18N)
      expect(errors).toContain(
         "cms.config entry 'news': 'title' is a system field of content entries, remove it from fields"
      )
      expect(errors.some((e) => e.includes("'seoImage' is a system field"))).toBe(true)
   })

   it('lists every system field', () => {
      expect([...CONTENT_SYSTEM_FIELDS]).toContain('publishedAt')
      expect([...CONTENT_SYSTEM_FIELDS]).toContain('body')
   })

   it('rejects titleField, drafts, columns, routes and a custom table', () => {
      const config = contentConfig()
      Object.assign(config.news!, {
         titleField: 'title',
         drafts: false,
         columns: ['title'],
         routes: ['/news'],
         table: {},
      })
      const errors = validateConfig(config, I18N).join('\n')
      expect(errors).toContain("use 'title' as titleField")
      expect(errors).toContain('always have drafts')
      expect(errors).toContain("columns need kind 'page'")
      expect(errors).toContain("overrides need kind 'page'")
      expect(errors).toContain('cannot use a custom table')
   })

   it('rejects a missing blocks map and unknown labels', () => {
      const config = contentConfig()
      config.news!.blocks = {}
      config.news!.labels = { nope: 'Nope' }
      const errors = validateConfig(config, I18N).join('\n')
      expect(errors).toContain('need a non-empty blocks map')
      expect(errors).toContain("labels names 'nope'")
   })

   it('lets a relation target a content entry', () => {
      const config = contentConfig()
      config.categories!.fields.featuredNews = { label: 'News', type: 'relation', to: 'news' }
      expect(validateConfig(config, I18N)).toEqual([])
   })

   it('keeps refusing a translatable slug source outside content entries', () => {
      const config = contentConfig()
      config.events!.fields.description = { label: 'Description', type: 'text', translatable: true }
      config.events!.fields.slug!.from = 'description'
      expect(validateConfig(config, I18N)).toContain(
         "cms.config entry 'events', field 'slug': slug source 'description' cannot be translatable"
      )
   })

   it('checks the block component, icon and prop names', () => {
      const config = contentConfig()
      const blocks = config.news!.blocks!
      blocks.text!.component = ' '
      blocks.image!.icon = ''
      blocks.image!.fields.class = { label: 'Class', type: 'text' }
      const errors = validateConfig(config, I18N).join('\n')
      expect(errors).toContain("block 'text': component must be a non-empty string")
      expect(errors).toContain("block 'image': icon must be a non-empty string")
      expect(errors).toContain("'class' cannot be a prop of the block component")
   })

   it('accepts a component on the blocks of a collection', () => {
      const config = contentConfig()
      config.events!.fields.body!.blocks!.hero!.component = 'EventHero'
      expect(validateConfig(config, I18N)).toEqual([])
   })
})

describe('datetime values', () => {
   const schema = buildEntrySchema(normalized().news!, I18N)
   const base = { title: { en: 'Hello' }, slug: 'hello' }

   it('normalizes an ISO date and time to UTC', () => {
      const parsed = schema.parse({ ...base, publishedAt: '2026-05-01T10:30:00+02:00' })
      expect((parsed as Record<string, unknown>).publishedAt).toBe('2026-05-01T08:30:00.000Z')
   })

   it('rejects a value without a time zone', () => {
      expect(schema.safeParse({ ...base, publishedAt: '2026-05-01T10:30' }).success).toBe(false)
      expect(schema.safeParse({ ...base, publishedAt: '2026-05-01' }).success).toBe(false)
   })

   it('accepts an empty value', () => {
      const parsed = schema.parse({ ...base, publishedAt: null })
      expect((parsed as Record<string, unknown>).publishedAt).toBeNull()
   })

   it('keeps the hidden flag of a block that does not declare it', () => {
      const parsed = schema.parse({
         ...base,
         body: [{ type: 'text', body: { en: '<p>x</p>' }, hidden: true }],
      }) as { body: Record<string, unknown>[] }
      expect(parsed.body[0]!.hidden).toBe(true)
   })
})

describe('content codegen', () => {
   const config = normalized()
   const sdl = renderGraphqlSdl(config)
   const schema = buildSchema(sdl)

   it('exposes list, count, byId and bySlug queries', () => {
      expect(sdl).toContain(
         'news(filters: NewsFilters, sort: [NewsSort!], limit: Int, offset: Int, locale: String): [News!]!'
      )
      expect(sdl).toContain('newsCount(filters: NewsFilters): Int!')
      expect(sdl).toContain('newsById(id: ID!, locale: String): News')
      expect(sdl).toContain('newsBySlug(slug: String!, locale: String): News')
      expect(sdl).not.toContain('eventsBySlug')
   })

   it('filters and sorts on publishedAt', () => {
      expect(sdl).toMatch(/input NewsFilters \{[^}]*publishedAt: StringFilter/)
      expect(sdl).toMatch(/enum NewsSortField \{[^}]*publishedAt/)
      expect(sdl).toMatch(/type News \{[^}]*createdAt: String!/)
   })

   it('generates content queries the schema accepts', () => {
      for (const query of [
         contentListQuery(config, 'news', config.news!),
         contentItemQuery(config, 'news', config.news!),
      ]) {
         expect(validate(schema, parse(query))).toEqual([])
      }
      expect(contentItemQuery(config, 'news', config.news!)).toContain(
         'item: newsBySlug(slug: $slug, locale: $locale)'
      )
      const file = renderQueriesFile(config)
      expect(file).toContain('export const cmsContentQueries')
      expect(file).toContain('export const cmsContentItemQueries')
      expect(file.split('cmsCollectionQueries')[1]!.split('cmsPageQueries')[0]).not.toContain(
         '"news"'
      )
   })

   it('types the content map and the block props', () => {
      const types = renderTypesFile(config)
      expect(types).toContain('export interface CmsContentTypes {\n  "news": NewsAuto\n}')
      expect(types).toContain('export type CmsContentName = keyof CmsContentTypes')
      expect(types).toContain('export interface NewsBodyTextProps {')
      expect(types).toContain('export interface NewsBodyText extends NewsBodyTextProps {')
      expect(types).toContain('      "text": NewsBodyTextProps')
      expect(types).toContain('> = CmsBlockPropTypes[E][F][B]')
      expect(types).toMatch(/export interface News \{[^}]*publishedAt: string \| null/)
   })

   it('creates the content table with status and timestamps', () => {
      const out = renderSchemaFile(config, 'sqlite')
      expect(out).toContain("export const news = sqliteTable('news'")
      expect(out).toContain("publishedAt: text('published_at'),")
      expect(out).toContain("slug: text('slug').unique().notNull()")
      expect(out).toContain("title: text('title', { mode: 'json' }).notNull()")
      expect(out).toMatch(/news = sqliteTable[\s\S]*status: text\('status'\)[\s\S]*created_at/)
   })
})

describe('content helpers', () => {
   it('flags a published item with a future publishedAt as scheduled', () => {
      const now = new Date('2026-06-01T00:00:00.000Z')
      expect(
         isScheduledContent({ status: 'published', publishedAt: '2026-07-01T00:00:00.000Z' }, now)
      ).toBe(true)
      expect(
         isScheduledContent({ status: 'published', publishedAt: '2026-05-01T00:00:00.000Z' }, now)
      ).toBe(false)
      expect(
         isScheduledContent({ status: 'draft', publishedAt: '2026-07-01T00:00:00.000Z' }, now)
      ).toBe(false)
   })

   it('reads the slug source from the default locale', () => {
      const title = normalized().news!.fields.title
      expect(slugSourceValue(title, { en: 'Hello', it: 'Ciao' }, 'en')).toBe('Hello')
      expect(slugSourceValue({ label: 'T', type: 'text' }, 'Plain', 'en')).toBe('Plain')
      expect(slugSourceValue(title, null, 'en')).toBeNull()
   })
})

describe('public visibility of content', () => {
   const news = sqliteTable('news', {
      id: text('id').primaryKey(),
      status: text('status').notNull(),
      publishedAt: text('published_at'),
   })

   function setup() {
      const sqlite = new Database(':memory:')
      sqlite.exec(
         'create table news (id text primary key, status text not null, published_at text)'
      )
      const db = drizzle(sqlite)
      db.insert(news)
         .values([
            { id: 'past', status: 'published', publishedAt: '2026-05-01T08:00:00.000Z' },
            { id: 'now', status: 'published', publishedAt: '2026-06-01T00:00:00.000Z' },
            { id: 'future', status: 'published', publishedAt: '2026-07-01T08:00:00.000Z' },
            { id: 'undated', status: 'published', publishedAt: null },
            { id: 'draft', status: 'draft', publishedAt: '2026-05-01T08:00:00.000Z' },
         ])
         .run()
      return db
   }

   const columns = news as unknown as Parameters<typeof visibilityConditions>[1]
   const entry: Pick<CmsEntry, 'kind' | 'drafts'> = { kind: 'content', drafts: true }

   it('hides drafts and scheduled items', () => {
      const conditions = visibilityConditions(entry, columns, '2026-06-01T00:00:00.000Z')
      const visible = setup()
         .select({ id: news.id })
         .from(news)
         .where(and(...conditions))
         .orderBy(asc(news.id))
         .all()
      expect(visible.map((row) => row.id)).toEqual(['now', 'past'])
   })

   it('only checks the status of a collection with drafts', () => {
      const conditions = visibilityConditions(
         { kind: 'collection', drafts: true },
         columns,
         '2026-06-01T00:00:00.000Z'
      )
      const visible = setup()
         .select({ id: news.id })
         .from(news)
         .where(and(...conditions))
         .orderBy(asc(news.id))
         .all()
      expect(visible.map((row) => row.id)).toEqual(['future', 'now', 'past', 'undated'])
   })

   it('adds no condition without drafts', () => {
      expect(visibilityConditions({ kind: 'collection' }, columns)).toEqual([])
   })
})
