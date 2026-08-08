import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const kit = vi.hoisted(() => ({
   addComponentsDir: vi.fn(),
   addImports: vi.fn(),
   addRouteMiddleware: vi.fn(),
   addServerHandler: vi.fn(),
   addServerPlugin: vi.fn(),
   addTemplate: vi.fn((template: { filename: string }) => ({
      filename: template.filename,
      dst: `/virtual/root/.nuxt/${template.filename}`,
   })),
   addTypeTemplate: vi.fn(),
   addVitePlugin: vi.fn(),
   createResolver: vi.fn(() => ({ resolve: (path: string) => path })),
   defineNuxtModule: vi.fn((definition: unknown) => definition),
   extendPages: vi.fn(),
   resolvePath: vi.fn(async (path: string) => `/virtual/root/${path}.ts`),
   useLogger: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
   })),
}))

vi.mock('@nuxt/kit', () => kit)

import cmsModule from '../src/module'

type AnyRecord = Record<string, any>

const moduleDefinition = cmsModule as unknown as {
   defaults: AnyRecord
   moduleDependencies: (nuxt: AnyRecord) => AnyRecord
   setup: (options: AnyRecord, nuxt: AnyRecord) => Promise<void>
}

function createNuxt() {
   return {
      options: {
         rootDir: '/virtual/root',
         dir: { public: 'public' },
         dev: false,
         alias: {} as Record<string, string>,
         watch: [] as string[],
         css: [] as string[],
         runtimeConfig: { public: {} } as AnyRecord,
      },
      hook: vi.fn(),
   }
}

function options(overrides: AnyRecord = {}) {
   return {
      ...moduleDefinition.defaults,
      i18n: { locales: ['en'], defaultLocale: 'en' },
      ...overrides,
   }
}

const ORIGINAL_ENV = process.env.NUXT_CMS_ENABLED

beforeEach(() => {
   vi.clearAllMocks()
   delete process.env.NUXT_CMS_ENABLED
})

afterEach(() => {
   if (ORIGINAL_ENV === undefined) delete process.env.NUXT_CMS_ENABLED
   else process.env.NUXT_CMS_ENABLED = ORIGINAL_ENV
})

describe('module setup when disabled', () => {
   it('registers only the stub composables', async () => {
      const nuxt = createNuxt()
      await moduleDefinition.setup(options({ enabled: false }), nuxt)

      expect(kit.addImports).toHaveBeenCalledTimes(1)
      const imports = kit.addImports.mock.calls[0]![0] as { name: string; from: string }[]
      expect(imports.map((entry) => entry.name).sort()).toEqual(['$cmsQuery', 'useCms'])
      for (const entry of imports) {
         expect(entry.from).toContain('cms-query-disabled')
      }
   })

   it('skips server handlers, plugins, pages, components and templates', async () => {
      const nuxt = createNuxt()
      await moduleDefinition.setup(options({ enabled: false }), nuxt)

      expect(kit.addServerHandler).not.toHaveBeenCalled()
      expect(kit.addServerPlugin).not.toHaveBeenCalled()
      expect(kit.extendPages).not.toHaveBeenCalled()
      expect(kit.addComponentsDir).not.toHaveBeenCalled()
      expect(nuxt.hook).not.toHaveBeenCalledWith('app:templates', expect.any(Function))
      expect(kit.addRouteMiddleware).not.toHaveBeenCalled()
      expect(kit.addTemplate).not.toHaveBeenCalled()
      expect(kit.addTypeTemplate).not.toHaveBeenCalled()
      expect(kit.addVitePlugin).not.toHaveBeenCalled()
   })

   it('registers no database or schema aliases', async () => {
      const nuxt = createNuxt()
      await moduleDefinition.setup(options({ enabled: false }), nuxt)

      expect(Object.keys(nuxt.options.alias)).toEqual([])
      expect(nuxt.options.runtimeConfig.cms).toBeUndefined()
   })

   it('still exposes the media storage mode on the public runtime config', async () => {
      const nuxt = createNuxt()
      await moduleDefinition.setup(
         options({
            enabled: false,
            media: { ...moduleDefinition.defaults.media, storage: 'local' },
         }),
         nuxt
      )

      expect(nuxt.options.runtimeConfig.public.cms.mediaStorage).toBe('local')
   })

   it('is disabled by the NUXT_CMS_ENABLED env variable alone', async () => {
      process.env.NUXT_CMS_ENABLED = '0'
      const nuxt = createNuxt()
      await moduleDefinition.setup(options(), nuxt)

      expect(kit.addServerHandler).not.toHaveBeenCalled()
      const imports = kit.addImports.mock.calls[0]![0] as { name: string; from: string }[]
      expect(imports[0]!.from).toContain('cms-query-disabled')
   })

   it('does not pull in nuxt-auth-utils', () => {
      expect(moduleDefinition.moduleDependencies({ options: { cms: { enabled: false } } })).toEqual(
         {}
      )

      process.env.NUXT_CMS_ENABLED = 'false'
      expect(moduleDefinition.moduleDependencies({ options: {} })).toEqual({})
   })
})

describe('module setup when enabled', () => {
   it('registers the real composables', async () => {
      const nuxt = createNuxt()
      await moduleDefinition.setup(options(), nuxt)

      const imports = kit.addImports.mock.calls[0]![0] as { name: string; from: string }[]
      expect(imports.map((entry) => entry.name).sort()).toEqual(['$cmsQuery', 'useCms'])
      for (const entry of imports) {
         expect(entry.from).toContain('composables/cms-query')
         expect(entry.from).not.toContain('disabled')
      }
   })

   it('registers server handlers, pages, components and templates by default', async () => {
      const nuxt = createNuxt()
      await moduleDefinition.setup(options(), nuxt)

      expect(kit.addServerHandler).toHaveBeenCalled()
      expect(kit.addServerPlugin).toHaveBeenCalled()
      expect(kit.extendPages).toHaveBeenCalled()
      expect(kit.addComponentsDir).toHaveBeenCalled()
      expect(kit.addTemplate).toHaveBeenCalled()

      const templatesHook = nuxt.hook.mock.calls.find((call) => call[0] === 'app:templates')
      expect(templatesHook).toBeDefined()
      const app = { layouts: {} as AnyRecord }
      templatesHook![1](app)
      expect(app.layouts['cms-admin']).toEqual({
         name: 'cms-admin',
         file: expect.stringContaining('layouts/cms-admin.vue'),
      })

      const routes = kit.addServerHandler.mock.calls.map((call) => (call[0] as AnyRecord).route)
      expect(routes).toContain('/api/cms/graphql')
   })

   it('registers the database, schema and graphql aliases', async () => {
      const nuxt = createNuxt()
      await moduleDefinition.setup(options(), nuxt)

      expect(nuxt.options.alias['#cms-db']).toBeDefined()
      expect(nuxt.options.alias['#cms-tables']).toBeDefined()
      expect(nuxt.options.alias['#cms-graphql']).toBeDefined()
      expect(nuxt.options.runtimeConfig.cms).toBeDefined()
   })

   it('stays enabled with a truthy env variable or an explicit option', async () => {
      process.env.NUXT_CMS_ENABLED = '1'
      const nuxt = createNuxt()
      await moduleDefinition.setup(options(), nuxt)
      expect(kit.addServerHandler).toHaveBeenCalled()

      expect(moduleDefinition.moduleDependencies({ options: {} })).toEqual({
         'nuxt-auth-utils': {},
      })
      expect(moduleDefinition.moduleDependencies({ options: { cms: { enabled: true } } })).toEqual({
         'nuxt-auth-utils': {},
      })
   })

   it('lets an explicit option win over the env variable', async () => {
      process.env.NUXT_CMS_ENABLED = '0'
      const nuxt = createNuxt()
      await moduleDefinition.setup(options({ enabled: true }), nuxt)

      expect(kit.addServerHandler).toHaveBeenCalled()
      expect(nuxt.options.alias['#cms-db']).toBeDefined()
   })

   it('defaults media.storage to s3', () => {
      expect(moduleDefinition.defaults.media.storage).toBe('s3')
   })

   it('writes the default s3 storage mode into the server and public runtime config', async () => {
      const nuxt = createNuxt()
      await moduleDefinition.setup(options(), nuxt)

      expect(nuxt.options.runtimeConfig.cms.media.storage).toBe('s3')
      expect(nuxt.options.runtimeConfig.public.cms.mediaStorage).toBe('s3')
   })

   it('carries a local storage mode into the server and public runtime config', async () => {
      const nuxt = createNuxt()
      await moduleDefinition.setup(
         options({ media: { ...moduleDefinition.defaults.media, storage: 'local' } }),
         nuxt
      )

      expect(nuxt.options.runtimeConfig.cms.media.storage).toBe('local')
      expect(nuxt.options.runtimeConfig.public.cms.mediaStorage).toBe('local')
   })

   it('resolves the local media root from a root-relative publicBaseUrl', async () => {
      const nuxt = createNuxt()
      await moduleDefinition.setup(
         options({
            media: {
               ...moduleDefinition.defaults.media,
               storage: 'local',
               publicBaseUrl: '/images/',
            },
         }),
         nuxt
      )

      expect(nuxt.options.runtimeConfig.cms.media.localRoot).toBe(
         resolve('/virtual/root', 'public', 'images')
      )
   })

   it.each([
      ['s3', 'https://cdn.example.com'],
      ['s3', '/images'],
      ['local', 'https://cdn.example.com'],
      ['local', ''],
   ])(
      'leaves the local media root empty for %s storage with %s',
      async (storage, publicBaseUrl) => {
         const nuxt = createNuxt()
         await moduleDefinition.setup(
            options({ media: { ...moduleDefinition.defaults.media, storage, publicBaseUrl } }),
            nuxt
         )

         expect(nuxt.options.runtimeConfig.cms.media.localRoot).toBe('')
      }
   )

   it('defaults media.maxFileSize to 10 MB in the server and public runtime config', async () => {
      const nuxt = createNuxt()
      await moduleDefinition.setup(options(), nuxt)

      expect(moduleDefinition.defaults.media.maxFileSize).toBe(10 * 1024 * 1024)
      expect(nuxt.options.runtimeConfig.cms.media.maxFileSize).toBe(10 * 1024 * 1024)
      expect(nuxt.options.runtimeConfig.public.cms.mediaMaxFileSize).toBe(10 * 1024 * 1024)
   })

   it('carries a custom media.maxFileSize into the server and public runtime config', async () => {
      const nuxt = createNuxt()
      await moduleDefinition.setup(
         options({
            media: { ...moduleDefinition.defaults.media, maxFileSize: 50 * 1024 * 1024 },
         }),
         nuxt
      )

      expect(nuxt.options.runtimeConfig.cms.media.maxFileSize).toBe(50 * 1024 * 1024)
      expect(nuxt.options.runtimeConfig.public.cms.mediaMaxFileSize).toBe(50 * 1024 * 1024)
   })

   it('falls back to the default cap for local storage', async () => {
      const nuxt = createNuxt()
      await moduleDefinition.setup(
         options({ media: { storage: 'local', publicBaseUrl: '/images' } }),
         nuxt
      )

      expect(nuxt.options.runtimeConfig.cms.media.maxFileSize).toBe(10 * 1024 * 1024)
   })

   it.each([0, -1, 1.5, Number.NaN])('rejects an invalid media.maxFileSize (%s)', async (value) => {
      const nuxt = createNuxt()
      await expect(
         moduleDefinition.setup(
            options({ media: { ...moduleDefinition.defaults.media, maxFileSize: value } }),
            nuxt
         )
      ).rejects.toThrow(/maxFileSize must be a positive integer/)
   })
})
