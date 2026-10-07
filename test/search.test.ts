import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { createApp, toWebHandler } from 'h3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { renderSchemaFile } from '../src/schema-codegen'
import type { CmsConfig, CmsEntry, CmsI18n } from '../src/runtime/shared/index'
import { normalizeCmsConfig, pageFields } from '../src/runtime/shared/index'
import { resolvePageRoutes } from '../src/runtime/shared/page-routes'
import type { CmsSearchHit, CmsSearchResponse } from '../src/runtime/shared/search'
import {
   cmsSearchLink,
   readSearchFocus,
   searchCmsLabels,
   searchLikePattern,
   searchSnippet,
   stripMarkup,
} from '../src/runtime/shared/search'
import type { PageDb, PageTables } from '../src/runtime/server/utils/page-rows'
import { pageWriteStatements } from '../src/runtime/server/utils/page-rows'
import type { SearchDb } from '../src/runtime/server/utils/search'
import { searchCms, searchLikeCondition } from '../src/runtime/server/utils/search'
import { buildEntrySchema } from '../src/runtime/shared/validation'

const state = vi.hoisted(() => ({
   db: null as unknown,
   schema: {} as Record<string, unknown>,
   config: {} as Record<string, unknown>,
   user: null as { email: string } | null,
}))

vi.mock('#imports', () => ({
   useRuntimeConfig: () => ({
      cms: { adminEmail: 'admin@example.com' },
      public: { cms: { i18n: { locales: ['en', 'it', 'de'], defaultLocale: 'en' } } },
   }),
   getUserSession: async () => (state.user ? { user: state.user } : {}),
}))

vi.mock('#cms-db', () => ({
   useDb: () => state.db,
   cmsDialect: 'sqlite',
}))

vi.mock('#cms-tables', () => ({
   get events() {
      return state.schema.events
   },
   get homepage() {
      return state.schema.homepage
   },
   get pages() {
      return state.schema.pages
   },
   get pages_fields() {
      return state.schema.pages_fields
   },
   get pages_media() {
      return state.schema.pages_media
   },
   get news() {
      return state.schema.news
   },
   get cms_media() {
      return state.schema.cms_media
   },
   get cms_users() {
      return state.schema.cms_users
   },
}))

vi.mock('#cms-config', () => ({
   get default() {
      return state.config
   },
}))

const I18N: CmsI18n = { locales: ['en', 'it', 'de'], defaultLocale: 'en' }
const TMP = join(__dirname, '.tmp-search')

function searchConfig(): CmsConfig {
   const pages: CmsEntry = {
      id: 'pages',
      label: 'Pages',
      kind: 'page',
      columns: ['metaTitle'],
      labels: { '/': 'Home' },
      fields: {
         metaTitle: { label: 'Meta title', type: 'text', translatable: true },
         intro: { label: 'Description', type: 'richtext', translatable: true },
         sections: {
            label: 'Sections',
            type: 'blocks',
            blocks: {
               text: {
                  label: 'Text block',
                  fields: {
                     body: { label: 'Paragraph', type: 'richtext', translatable: true },
                  },
               },
            },
         },
      },
      overrides: { '/about': { team: { label: 'Team members', type: 'text' } } },
   }
   pages.pages = resolvePageRoutes(pages, ['/', '/about'])
   const config: CmsConfig = {
      events: {
         id: 'events',
         label: 'Events',
         kind: 'collection',
         titleField: 'title',
         tabs: [
            { id: 'main', label: 'Main' },
            { id: 'extra', label: 'Logistics' },
         ],
         fields: {
            title: { label: 'Title', type: 'text', required: true },
            slug: { label: 'Slug', type: 'slug', from: 'title' },
            description: { label: 'Description', type: 'richtext', translatable: true },
            visibility: { label: 'Visibility', type: 'select', options: ['public', 'hidden'] },
            contactEmail: { label: 'Contact email', type: 'email', tab: 'extra' },
            notes: { label: 'Internal notes', type: 'text', private: true, tab: 'extra' },
            seats: { label: 'Seats', type: 'number' },
            body: {
               label: 'Body',
               type: 'blocks',
               blocks: {
                  hero: {
                     label: 'Hero',
                     fields: { heading: { label: 'Heading', type: 'text', translatable: true } },
                  },
                  quote: { label: 'Quote', fields: { text: { label: 'Text', type: 'text' } } },
               },
            },
         },
      },
      homepage: {
         id: 'homepage',
         label: 'Homepage',
         kind: 'single',
         tabs: [
            { id: 'hero', label: 'Hero' },
            { id: 'seo', label: 'Search engines' },
         ],
         fields: {
            heroTitle: { label: 'Hero title', type: 'text', translatable: true },
            metaDescription: { label: 'Meta description', type: 'text', tab: 'seo' },
         },
      },
      pages,
      news: {
         id: 'news',
         label: 'News',
         kind: 'content',
         blocks: {
            text: {
               label: 'Text',
               fields: { body: { label: 'Body text', type: 'richtext', translatable: true } },
            },
         },
         fields: {},
      } as CmsEntry,
   }
   return normalizeCmsConfig(config, I18N)
}

let config: CmsConfig
let db: ReturnType<typeof drizzle>
let schema: Record<string, unknown>

function table(name: string) {
   return schema[name] as SQLiteTable
}

async function insert(name: string, values: Record<string, unknown>) {
   await db.insert(table(name)).values(values as never)
}

async function savePage(path: string, values: Record<string, unknown>) {
   const entry = config.pages!
   const route = entry.pages!.find((candidate) => candidate.path === path)!
   const parsed = buildEntrySchema({ ...entry, fields: pageFields(entry, path) }, I18N).parse(
      values
   ) as Record<string, unknown>
   const tables = {
      page: table('pages'),
      fields: table('pages_fields'),
      media: table('pages_media'),
   } as PageTables
   for (const statement of pageWriteStatements(
      db as unknown as PageDb,
      'sqlite',
      tables,
      entry,
      route,
      { ...parsed, updatedAt: '2026-10-01T00:00:00.000Z' }
   )) {
      await statement
   }
}

function search(query: string) {
   return searchCms({
      db: db as unknown as SearchDb,
      dialect: 'sqlite',
      config,
      tables: schema,
      i18n: I18N,
      query,
   })
}

function values(response: CmsSearchResponse) {
   return response.hits.filter((hit) => hit.type === 'value')
}

function snippetText(hit: CmsSearchHit) {
   return `${hit.snippet.before}[${hit.snippet.match}]${hit.snippet.after}`
}

beforeAll(async () => {
   mkdirSync(TMP, { recursive: true })
   config = searchConfig()
   const file = join(TMP, 'schema.ts')
   writeFileSync(file, renderSchemaFile(config, 'sqlite'))
   schema = (await import(file)) as Record<string, unknown>
   const { generateSQLiteDrizzleJson, generateSQLiteMigration } = await import('drizzle-kit/api')
   const statements = await generateSQLiteMigration(
      await generateSQLiteDrizzleJson({}),
      await generateSQLiteDrizzleJson(schema)
   )
   const sqlite = new Database(':memory:')
   for (const statement of statements) sqlite.exec(statement)
   db = drizzle(sqlite)

   await insert('events', {
      id: 'spring',
      title: 'Spring fair',
      slug: 'spring-fair',
      description: {
         en: '<p>A <strong>lovely</strong> fair by the lake</p>',
         de: '<p>Ein Fest am See mit <em>Musik</em> &amp; Tanz</p>',
      },
      visibility: 'hidden',
      contactEmail: 'fair@lake.example',
      notes: 'Ask the mayor about parking',
      seats: 40,
      body: [
         { type: 'hero', heading: { en: 'Welcome anglers', it: 'Benvenuti pescatori' } },
         { type: 'quote', text: 'Fish are friends' },
      ],
   })
   await insert('events', { id: 'percent', title: '100% natural bait', slug: 'percent' })
   await insert('events', { id: 'thousand', title: '1000 natural lures', slug: 'thousand' })
   await insert('events', { id: 'under', title: 'snake_case meetup', slug: 'under' })
   await insert('events', { id: 'nounder', title: 'snakeXcase meetup', slug: 'nounder' })
   await insert('homepage', {
      id: 'homepage',
      heroTitle: { en: 'Fishing in the valley', de: 'Angeln im Tal' },
      metaDescription: 'The fishing association',
   })
   await insert('news', {
      id: 'n1',
      title: { en: 'Season opening', it: 'Apertura della stagione' },
      slug: 'season-opening',
      status: 'draft',
      body: [{ type: 'text', body: { en: '<p>The river opens on <b>March 1</b></p>' } }],
   })
   await insert('cms_media', {
      key: 'library/sunset.webp',
      alt: 'Lake at sunset',
      folder: 'library',
   })
   await savePage('/', {
      metaTitle: { en: 'Home', de: 'Startseite' },
      intro: { en: '<p>Welcome</p>', de: '<p>Wir sind ein Verein für Fischer</p>' },
      sections: [{ type: 'text', body: { en: '<p>Our <i>rivers</i> are clean</p>' } }],
   })
   await savePage('/about', {
      metaTitle: { en: 'About us', it: 'Chi siamo' },
      intro: { en: '<p>History of the club</p>' },
      team: 'Anna, Marco and Lukas',
   })
})

afterAll(() => {
   rmSync(TMP, { recursive: true, force: true })
})

describe('search helpers', () => {
   it('escapes LIKE wildcards and the escape character', () => {
      expect(searchLikePattern('50%_off\\x')).toBe('%50\\%\\_off\\\\x%')
   })

   it('strips markup and decodes entities', () => {
      expect(stripMarkup('<p>Fish &amp; <strong>chips</strong></p><p>&#252;ber&nbsp;all</p>')).toBe(
         ' Fish & chips  über all '
      )
   })

   it('cuts a snippet around the first case-insensitive match', () => {
      const text = `${'a'.repeat(60)} The Lake ${'b'.repeat(120)}`
      const snippet = searchSnippet(text, 'lake')!
      expect(snippet.match).toBe('Lake')
      expect(snippet.before.startsWith('…')).toBe(true)
      expect(snippet.after.endsWith('…')).toBe(true)
      expect(searchSnippet('nothing here', 'lake')).toBeNull()
   })

   it('builds and reads focus links', () => {
      const link = cmsSearchLink('/cms/pages/home', { field: 'intro', locale: 'de', block: 2 })
      expect(link).toBe('/cms/pages/home?field=intro&locale=de&block=2')
      expect(readSearchFocus({ field: 'intro', locale: 'de', block: '2' })).toEqual({
         field: 'intro',
         locale: 'de',
         block: 2,
      })
      expect(readSearchFocus({ block: '1' })).toBeNull()
      expect(readSearchFocus({ tab: 'seo', block: 'x' })).toEqual({
         tab: 'seo',
         locale: null,
         block: null,
      })
   })
})

describe('label search', () => {
   it('needs at least two characters', () => {
      expect(searchCmsLabels(searchConfig(), ' e ')).toEqual({ hits: [], truncated: false })
   })

   it('finds entry, page, tab, field and block labels', () => {
      const find = (query: string) => searchCmsLabels(searchConfig(), query).hits
      expect(find('events')[0]).toMatchObject({
         type: 'entry',
         collection: 'events',
         to: '/cms/events',
      })
      expect(find('home')).toEqual(
         expect.arrayContaining([
            expect.objectContaining({ type: 'entry', collection: 'homepage' }),
            expect.objectContaining({
               type: 'page',
               collection: 'pages',
               id: 'home',
               title: 'Home',
               to: '/cms/pages/home',
            }),
         ])
      )
      expect(find('/about')[0]).toMatchObject({ type: 'page', id: 'about', to: '/cms/pages/about' })
      expect(find('search engines')[0]).toMatchObject({
         type: 'tab',
         collection: 'homepage',
         to: '/cms/homepage?tab=seo',
      })
      expect(find('hero title')[0]).toMatchObject({
         type: 'field',
         field: 'heroTitle',
         fieldLabel: 'Hero › Hero title',
         to: '/cms/homepage?field=heroTitle',
      })
      expect(find('team members')[0]).toMatchObject({
         type: 'field',
         field: 'team',
         to: '/cms/pages/about?field=team',
         title: 'About',
      })
      expect(find('text block')[0]).toMatchObject({
         type: 'block',
         collection: 'pages',
         fieldLabel: 'Sections › Text block',
      })
      expect(find('paragraph')[0]).toMatchObject({
         type: 'field',
         fieldLabel: 'Sections › Text block › Paragraph',
      })
      expect(find('contact email')[0]).toMatchObject({
         fieldLabel: 'Logistics › Contact email',
         to: '/cms/events',
      })
   })

   it('ranks labels that start with the query first', () => {
      const hits = searchCmsLabels(searchConfig(), 'title').hits
      expect(hits[0]!.snippet.before).toBe('')
   })
})

describe('value search', () => {
   it('returns label hits before value hits', async () => {
      const response = await search('hero')
      expect(response.hits[0]!.type).not.toBe('value')
      expect(values(response).length).toBe(0)
   })

   it('finds a translatable value in a non-default locale', async () => {
      const response = await search('angeln im')
      expect(values(response)).toEqual([
         expect.objectContaining({
            collection: 'homepage',
            kind: 'single',
            id: null,
            field: 'heroTitle',
            fieldLabel: 'Hero title',
            locale: 'de',
            to: '/cms/homepage?field=heroTitle&locale=de',
         }),
      ])
   })

   it('matches rich text without markup and highlights the snippet', async () => {
      const [hit] = values(await search('fair by'))
      expect(hit).toMatchObject({
         collection: 'events',
         id: 'spring',
         title: 'Spring fair',
         field: 'description',
         locale: 'en',
         to: '/cms/events/spring?field=description&locale=en',
      })
      expect(snippetText(hit!)).toBe('A lovely [fair by] the lake')
      const [tanz] = values(await search('tanz'))
      expect(snippetText(tanz!)).toBe('Ein Fest am See mit Musik & [Tanz]')
   })

   it('finds page fields stored as rows, in every locale', async () => {
      const [hit] = values(await search('verein für'))
      expect(hit).toMatchObject({
         collection: 'pages',
         kind: 'page',
         id: 'home',
         title: 'Home',
         field: 'intro',
         fieldLabel: 'Description',
         locale: 'de',
         to: '/cms/pages/home?field=intro&locale=de',
      })
      expect(values(await search('chi siamo'))[0]).toMatchObject({
         id: 'about',
         field: 'metaTitle',
         locale: 'it',
      })
      expect(values(await search('marco'))[0]).toMatchObject({
         id: 'about',
         field: 'team',
         fieldLabel: 'Team members',
         locale: null,
      })
   })

   it('finds values inside blocks of collections, pages and content', async () => {
      expect(values(await search('benvenuti'))[0]).toMatchObject({
         collection: 'events',
         field: 'body',
         fieldLabel: 'Body › Hero › Heading',
         locale: 'it',
         to: '/cms/events/spring?field=body&locale=it&block=0',
      })
      expect(values(await search('friends'))[0]).toMatchObject({
         fieldLabel: 'Body › Quote › Text',
         locale: null,
         to: '/cms/events/spring?field=body&block=1',
      })
      expect(values(await search('are clean'))[0]).toMatchObject({
         collection: 'pages',
         id: 'home',
         field: 'sections',
         fieldLabel: 'Sections › Text block › Paragraph',
         to: '/cms/pages/home?field=sections&locale=en&block=0',
      })
      expect(values(await search('march 1'))[0]).toMatchObject({
         collection: 'news',
         kind: 'content',
         id: 'n1',
         title: 'Season opening',
         fieldLabel: 'Body › Text › Body text',
      })
   })

   it('searches selects, slugs, emails, private fields and media alt texts', async () => {
      expect(values(await search('hidden'))[0]).toMatchObject({ field: 'visibility' })
      expect(values(await search('spring-fa'))[0]).toMatchObject({ field: 'slug' })
      expect(values(await search('lake.example'))[0]).toMatchObject({ field: 'contactEmail' })
      expect(values(await search('mayor'))[0]).toMatchObject({ field: 'notes' })
      expect(values(await search('apertura'))[0]).toMatchObject({ field: 'title', locale: 'it' })
      expect((await search('at sunset')).hits).toEqual([
         expect.objectContaining({
            type: 'media',
            kind: 'media',
            id: 'library/sunset.webp',
            title: 'sunset.webp',
            to: '/cms/media?folder=library',
         }),
      ])
   })

   it('ignores numbers and markup', async () => {
      expect(values(await search('40'))).toEqual([])
      expect(values(await search('strong'))).toEqual([])
   })

   it('escapes LIKE wildcards in the query', async () => {
      expect(values(await search('0% nat')).map((hit) => hit.id)).toEqual(['percent'])
      expect(values(await search('snake_case')).map((hit) => hit.id)).toEqual(['under'])
      expect(values(await search('%%')).length).toBe(0)
   })

   it('needs at least two characters', async () => {
      expect(await search('  a ')).toEqual({ query: 'a', hits: [], truncated: false })
   })

   it('casts columns to text on postgres', async () => {
      const file = join(TMP, 'pg-schema.ts')
      writeFileSync(file, renderSchemaFile(config, 'postgres'))
      const pgSchema = (await import(file)) as Record<string, Record<string, never>>
      const query = drizzlePg
         .mock()
         .select()
         .from(pgSchema.events as never)
         .where(searchLikeCondition('postgres', pgSchema.events!.title!, '%x%'))
      const { sql, params } = query.toSQL()
      expect(sql).toContain(`lower(cast("events"."title" as text)) like $1 escape '\\'`)
      expect(params).toEqual(['%x%'])
   })
})

describe('search endpoint', () => {
   async function request(query: string) {
      state.db = db
      state.schema = schema
      state.config = config
      const { default: handler } = await import('../src/runtime/server/api/search.get')
      const web = toWebHandler(createApp().use(handler))
      return web(new Request(`http://cms.test/api/cms/search?q=${encodeURIComponent(query)}`))
   }

   it('requires an admin session', async () => {
      state.user = null
      const response = await request('angeln')
      expect(response.status).toBe(401)
   })

   it('rejects a non-admin session', async () => {
      state.user = { email: 'someone@example.com' }
      const response = await request('angeln')
      expect(response.status).toBe(403)
   })

   it('searches for an admin', async () => {
      state.user = { email: 'admin@example.com' }
      const response = await request('angeln im')
      expect(response.status).toBe(200)
      const body = (await response.json()) as CmsSearchResponse
      expect(body.query).toBe('angeln im')
      expect(values(body)[0]).toMatchObject({ collection: 'homepage', locale: 'de' })
   })

   it('rejects an overlong query', async () => {
      state.user = { email: 'admin@example.com' }
      const response = await request('x'.repeat(201))
      expect(response.status).toBe(400)
   })
})
