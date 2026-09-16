import { buildSchema, parse, validate } from 'graphql'
import { describe, expect, it } from 'vitest'
import { resolvePageRoutes, routePathFromFile } from '../src/page-routes'
import { pageQuery, renderQueriesFile } from '../src/queries-codegen'
import { renderSchemaFile, validateConfig } from '../src/schema-codegen'
import { renderGraphqlSdl } from '../src/runtime/shared/graphql-sdl'
import type { CmsConfig, CmsEntry } from '../src/runtime/shared/index'
import { pageFields, pageKeyFromPath } from '../src/runtime/shared/index'
import { renderTypesFile } from '../src/types-codegen'

const ROUTES = ['/', '/about', '/a-tavola', '/a-tavola/ristorante']

function pageEntry(overrides: Partial<CmsEntry> = {}): CmsEntry {
   const entry: CmsEntry = {
      id: 'pages',
      label: 'Pages',
      kind: 'page',
      fields: {
         title: { label: 'Title', type: 'text', translatable: true },
         cover: { label: 'Cover', type: 'media', mediaType: ['image', 'video'] },
      },
      overrides: {
         '/about': { intro: { label: 'Intro', type: 'text' } },
      },
      ...overrides,
   }
   entry.pages = resolvePageRoutes(entry, ROUTES)
   return entry
}

function pageConfig(overrides: Partial<CmsEntry> = {}): CmsConfig {
   return { pages: pageEntry(overrides) }
}

describe('route discovery', () => {
   it('maps page files to route paths', () => {
      expect(routePathFromFile('index.vue')).toBe('/')
      expect(routePathFromFile('about.vue')).toBe('/about')
      expect(routePathFromFile('a-tavola/index.vue')).toBe('/a-tavola')
      expect(routePathFromFile('a-tavola/ristorante.vue')).toBe('/a-tavola/ristorante')
   })

   it('drops the route groups from the path', () => {
      expect(routePathFromFile('(marketing)/pricing.vue')).toBe('/pricing')
   })

   it('skips dynamic routes', () => {
      expect(routePathFromFile('blog/[slug].vue')).toBeNull()
      expect(routePathFromFile('[...all].vue')).toBeNull()
   })
})

describe('page routes', () => {
   it('gives every path a key and a label', () => {
      const routes = resolvePageRoutes(pageEntry(), ROUTES)
      expect(routes.map((route) => route.key)).toEqual([
         'home',
         'aTavola',
         'aTavolaRistorante',
         'about',
      ])
      expect(routes.find((route) => route.path === '/a-tavola/ristorante')!.label).toBe(
         'Ristorante'
      )
      expect(routes.find((route) => route.path === '/')!.label).toBe('Home')
   })

   it('takes the declared list instead of the discovered one', () => {
      const routes = resolvePageRoutes(pageEntry({ routes: ['/only'] }), ROUTES)
      expect(routes.map((route) => route.path)).toEqual(['/only'])
   })

   it('adds include, drops exclude and follows order', () => {
      const routes = resolvePageRoutes(
         pageEntry({ include: ['/extra'], exclude: ['/about'], order: ['/a-tavola', '/'] }),
         ROUTES
      )
      expect(routes.map((route) => route.path)).toEqual([
         '/a-tavola',
         '/',
         '/a-tavola/ristorante',
         '/extra',
      ])
   })

   it('takes the label from the config when it is given', () => {
      const routes = resolvePageRoutes(pageEntry({ labels: { '/': 'Homepage' } }), ROUTES)
      expect(routes[0]!.label).toBe('Homepage')
   })

   it('builds a key from the path', () => {
      expect(pageKeyFromPath('/')).toBe('home')
      expect(pageKeyFromPath('/asolo-e-dintorni/venezia')).toBe('asoloEDintorniVenezia')
   })
})

describe('page fields', () => {
   it('adds the override fields to the shared ones', () => {
      expect(Object.keys(pageFields(pageEntry(), '/about'))).toEqual(['title', 'cover', 'intro'])
      expect(Object.keys(pageFields(pageEntry(), '/'))).toEqual(['title', 'cover'])
   })
})

describe('page validation', () => {
   const errorsOf = (entry: Partial<CmsEntry>) => validateConfig(pageConfig(entry), undefined)

   it('accepts a page entry', () => {
      expect(validateConfig(pageConfig(), { locales: ['en'], defaultLocale: 'en' })).toEqual([])
   })

   it('rejects a second page entry', () => {
      const config = pageConfig()
      config.other = pageEntry({ id: 'other' })
      expect(validateConfig(config, undefined).join()).toContain('only one page entry')
   })

   it('rejects the reserved path field', () => {
      expect(errorsOf({ fields: { path: { label: 'Path', type: 'text' } } }).join()).toContain(
         "'path' is a reserved field name"
      )
   })

   it('rejects an override on an unknown path', () => {
      expect(
         errorsOf({ overrides: { '/nope': { extra: { label: 'Extra', type: 'text' } } } }).join()
      ).toContain("'/nope' is not a page path")
   })

   it('rejects an override that redeclares a shared field', () => {
      expect(
         errorsOf({ overrides: { '/about': { title: { label: 'Title', type: 'text' } } } }).join()
      ).toContain('already declared for every page')
   })

   it('rejects the same field declared with two types', () => {
      expect(
         errorsOf({
            overrides: {
               '/about': { extra: { label: 'Extra', type: 'text' } },
               '/a-tavola': { extra: { label: 'Extra', type: 'number' } },
            },
         }).join()
      ).toContain('different pages')
   })

   it('rejects a titleField on a page', () => {
      expect(errorsOf({ titleField: 'title' }).join()).toContain('pages have no titleField')
   })

   it('rejects page options on other kinds', () => {
      const config: CmsConfig = {
         home: {
            id: 'home',
            label: 'Home',
            kind: 'single',
            fields: { title: { label: 'Title', type: 'text' } },
            routes: 'auto',
         },
      }
      expect(validateConfig(config, undefined).join()).toContain("need kind 'page'")
   })
})

describe('page codegen', () => {
   const config = pageConfig()
   const sdl = renderGraphqlSdl(config)

   it('puts every field of every page in one table', () => {
      const schema = renderSchemaFile(config, 'sqlite', () => 'drizzle-orm')
      expect(schema).toContain("export const pages = sqliteTable('pages', {")
      expect(schema).toContain("path: text('path').notNull().unique()")
      expect(schema).toContain("intro: text('intro')")
   })

   it('exposes the list and the path query', () => {
      expect(sdl).toContain('pages(locale: String): [Pages!]!')
      expect(sdl).toContain('pagesByPath(path: String!, locale: String): Pages')
      expect(sdl.match(/type Pages \{[^}]*\}/)![0]).toContain('path: String!')
   })

   it('types each path with its own fields', () => {
      const types = renderTypesFile(config)
      expect(types).toContain(
         `"/": Pick<PagesAuto, 'id' | 'path' | 'updatedAt' | 'title' | 'cover'>`
      )
      expect(types).toContain(
         `"/about": Pick<PagesAuto, 'id' | 'path' | 'updatedAt' | 'title' | 'cover' | 'intro'>`
      )
      expect(types).toContain('export type CmsPagePath = keyof CmsPageTypes')
   })

   it('generates one query per path that the schema accepts', () => {
      const schema = buildSchema(sdl)
      for (const route of config.pages!.pages!) {
         const query = pageQuery(config, 'pages', config.pages!, route.path)
         expect(validate(schema, parse(query))).toEqual([])
      }
      expect(pageQuery(config, 'pages', config.pages!, '/about')).toContain('intro')
      expect(pageQuery(config, 'pages', config.pages!, '/')).not.toContain('intro')
   })

   it('lists the page queries by path', () => {
      const file = renderQueriesFile(config)
      expect(file).toContain('export const cmsPageQueries')
      expect(file).toContain('"/a-tavola/ristorante"')
   })
})
