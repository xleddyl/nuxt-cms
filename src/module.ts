import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
   addComponentsDir,
   addImports,
   addRouteMiddleware,
   addServerHandler,
   addServerPlugin,
   addTemplate,
   addTypeTemplate,
   addVitePlugin,
   createResolver,
   defineNuxtModule,
   extendPages,
   resolvePath,
   useLogger,
} from '@nuxt/kit'
import type { ModuleDependencies, Nuxt } from '@nuxt/schema'
import tailwindcss from '@tailwindcss/vite'
import svgLoader from 'vite-svg-loader'
import { buildSchema, introspectionFromSchema } from 'graphql'
import { minifyIntrospection, outputIntrospectionFile } from 'gql.tada/internal'
import { createJiti } from 'jiti'
import { renderGraphqlSdl } from './runtime/shared/graphql-sdl'
import type { CmsConfig, MediaStorageMode } from './runtime/shared/index'
import { DEFAULT_MEDIA_MAX_FILE_SIZE } from './runtime/shared/index'
import {
   collectMediaManifest,
   renderMediaManifestFile,
   renderMediaManifestTypes,
} from './media-manifest-codegen'
import type { Driver } from './schema-codegen'
import { renderSchemaFile, validateConfig } from './schema-codegen'
import { renderTypesFile } from './types-codegen'
import { CMS_ENABLED_ENV, resolveCmsEnabled } from './enabled'

export type ModuleOptionsDatabase =
   | { driver?: 'sqlite'; path?: string }
   | { driver: 'postgres'; url?: string }
   | { driver: 'libsql'; url?: string; authToken?: string }

export type ModuleOptionsMedia =
   | {
        storage?: 's3'
        endpoint?: string
        region?: string
        bucket?: string
        accessKeyId?: string
        secretAccessKey?: string
        publicBaseUrl?: string
        presignExpiry?: number
        maxFileSize?: number
     }
   | { storage: 'local'; publicBaseUrl: string }

export interface ModuleOptions {
   enabled?: boolean
   configPath?: string
   admin?: {
      email?: string
      password?: string
   }
   database?: ModuleOptionsDatabase
   media?: ModuleOptionsMedia
   i18n?: {
      locales?: string[]
      defaultLocale?: string
   }
   graphql?: {
      maxDepth?: number
   }
}

interface ResolvedModuleOptions {
   configPath: string
   admin: {
      email: string
      password: string
   }
   database: {
      driver: Driver
      path: string
      url: string
      authToken: string
   }
   media: {
      storage: MediaStorageMode
      endpoint: string
      region: string
      bucket: string
      publicBaseUrl: string
      presignExpiry: number
      maxFileSize: number
      accessKeyId: string
      secretAccessKey: string
   }
   i18n: {
      locales: string[]
      defaultLocale: string
   }
   graphql: {
      maxDepth: number
   }
}

function resolveDatabaseOptions(
   database: ModuleOptions['database']
): ResolvedModuleOptions['database'] {
   if (database?.driver === 'postgres') {
      return { driver: 'postgres', path: 'data/cms.db', url: database.url ?? '', authToken: '' }
   }
   if (database?.driver === 'libsql') {
      return {
         driver: 'libsql',
         path: 'data/cms.db',
         url: database.url ?? '',
         authToken: database.authToken ?? '',
      }
   }
   return { driver: 'sqlite', path: database?.path ?? 'data/cms.db', url: '', authToken: '' }
}

function resolveMediaOptions(media: ModuleOptions['media']): ResolvedModuleOptions['media'] {
   if (media?.storage === 'local') {
      return {
         storage: 'local',
         endpoint: '',
         region: 'auto',
         bucket: '',
         accessKeyId: '',
         secretAccessKey: '',
         presignExpiry: 600,
         maxFileSize: DEFAULT_MEDIA_MAX_FILE_SIZE,
         publicBaseUrl: media.publicBaseUrl,
      }
   }
   return {
      storage: 's3',
      endpoint: media?.endpoint ?? '',
      region: media?.region ?? 'auto',
      bucket: media?.bucket ?? '',
      accessKeyId: media?.accessKeyId ?? '',
      secretAccessKey: media?.secretAccessKey ?? '',
      presignExpiry: media?.presignExpiry ?? 600,
      maxFileSize: media?.maxFileSize ?? DEFAULT_MEDIA_MAX_FILE_SIZE,
      publicBaseUrl: media?.publicBaseUrl ?? '',
   }
}

function resolveModuleOptions(options: ModuleOptions): ResolvedModuleOptions {
   return {
      configPath: options.configPath ?? 'cms.config',
      admin: {
         email: options.admin?.email ?? '',
         password: options.admin?.password ?? '',
      },
      database: resolveDatabaseOptions(options.database),
      media: resolveMediaOptions(options.media),
      i18n: {
         locales: options.i18n?.locales ?? [],
         defaultLocale: options.i18n?.defaultLocale ?? 'en',
      },
      graphql: {
         maxDepth: options.graphql?.maxDepth ?? 8,
      },
   }
}

export default defineNuxtModule<ModuleOptions>({
   meta: {
      name: '@xleddyl/nuxt-cms',
      configKey: 'cms',
   },
   moduleDependencies: (nuxt: Nuxt): ModuleDependencies =>
      resolveCmsEnabled(
         (nuxt.options as unknown as { cms?: { enabled?: boolean } }).cms?.enabled,
         process.env[CMS_ENABLED_ENV]
      )
         ? { 'nuxt-auth-utils': {} }
         : {},
   defaults: {
      configPath: 'cms.config',
      admin: {
         email: '',
         password: '',
      },
      database: {
         driver: 'sqlite',
         path: 'data/cms.db',
      },
      media: {
         storage: 's3',
         endpoint: '',
         region: 'auto',
         bucket: '',
         publicBaseUrl: '',
         presignExpiry: 600,
         maxFileSize: DEFAULT_MEDIA_MAX_FILE_SIZE,
         accessKeyId: '',
         secretAccessKey: '',
      },
      i18n: {
         locales: [],
         defaultLocale: 'en',
      },
      graphql: {
         maxDepth: 8,
      },
   },
   async setup(options, nuxt) {
      const resolver = createResolver(import.meta.url)
      const logger = useLogger('nuxt-cms')
      const resolved = resolveModuleOptions(options)

      if (!resolveCmsEnabled(options.enabled, process.env[CMS_ENABLED_ENV])) {
         const stub = resolver.resolve('./runtime/app/composables/cms-query-disabled')
         addImports([
            { name: 'useCms', from: stub },
            { name: '$cmsQuery', from: stub },
         ])
         nuxt.options.runtimeConfig.public.cms = {
            mediaBaseUrl: resolved.media.publicBaseUrl,
            mediaStorage: resolved.media.storage,
            mediaMaxFileSize: resolved.media.maxFileSize,
            i18n: resolved.i18n,
         }
         logger.info(
            '[nuxt-cms] disabled: registering no-op useCms/$cmsQuery stubs, skipping admin, server and database setup'
         )
         return
      }

      if (
         (resolved.database.driver === 'postgres' || resolved.database.driver === 'libsql') &&
         !resolved.database.url &&
         !process.env.NUXT_CMS_DATABASE_URL
      ) {
         logger.warn(
            `[nuxt-cms] database.driver is '${resolved.database.driver}' but no url is configured (database.url or NUXT_CMS_DATABASE_URL); the app will fail to connect unless one is provided before the server starts.`
         )
      }

      if (!Number.isInteger(resolved.media.maxFileSize) || resolved.media.maxFileSize <= 0) {
         throw new Error(
            `[nuxt-cms] media.maxFileSize must be a positive integer number of bytes, got ${resolved.media.maxFileSize}`
         )
      }

      const s3KeysConfigured = [
         resolved.media.endpoint,
         resolved.media.bucket,
         resolved.media.accessKeyId,
         resolved.media.secretAccessKey,
      ].some(Boolean)
      if (
         resolved.media.storage === 's3' &&
         s3KeysConfigured &&
         !resolved.media.publicBaseUrl &&
         !process.env.NUXT_PUBLIC_CMS_MEDIA_BASE_URL
      ) {
         logger.warn(
            "[nuxt-cms] media.storage is 's3' with credentials configured but no publicBaseUrl (media.publicBaseUrl or NUXT_PUBLIC_CMS_MEDIA_BASE_URL); uploaded media URLs will be null."
         )
      }

      const configPath = await resolvePath(resolved.configPath, { cwd: nuxt.options.rootDir })
      nuxt.options.alias['#nuxt-cms'] = resolver.resolve('./runtime/shared/index')
      nuxt.options.watch.push(configPath)

      let cmsConfig: CmsConfig = {}
      if (existsSync(configPath)) {
         nuxt.options.alias['#cms-config'] = configPath
         const jiti = createJiti(import.meta.url, {
            moduleCache: false,
            alias: { '#nuxt-cms': resolver.resolve('./runtime/shared/index') },
         })
         cmsConfig = (await jiti.import(configPath, { default: true })) as CmsConfig
      } else {
         logger.warn(
            `[nuxt-cms] Config file not found: ${configPath}. Using an empty registry — create a ${resolved.configPath}.ts with defineCmsConfig().`
         )
         nuxt.options.alias['#cms-config'] = resolver.resolve('./runtime/shared/empty-config')
      }

      const configErrors = validateConfig(cmsConfig, resolved.i18n)
      if (configErrors.length) {
         for (const error of configErrors) logger.error(error)
         throw new Error(
            `[nuxt-cms] Invalid cms config (${configErrors.length} error${
               configErrors.length > 1 ? 's' : ''
            })`
         )
      }

      const moduleRequire = createRequire(import.meta.url)
      const resolveImport = (specifier: string) => {
         try {
            return fileURLToPath(import.meta.resolve(specifier)).replace(/\\/g, '/')
         } catch {
            return moduleRequire.resolve(specifier).replace(/\\/g, '/')
         }
      }

      const schemaTemplate = addTemplate({
         filename: 'cms/schema.ts',
         write: true,
         getContents: () =>
            renderSchemaFile(
               cmsConfig,
               resolved.database.driver === 'postgres' ? 'postgres' : 'sqlite',
               resolveImport
            ),
      })
      nuxt.options.alias['#cms-tables'] = schemaTemplate.dst

      addTemplate({
         filename: 'cms/schema.graphql',
         write: true,
         getContents: () => renderGraphqlSdl(cmsConfig),
      })

      const typesTemplate = addTemplate({
         filename: 'cms/types.ts',
         write: true,
         getContents: () => renderTypesFile(cmsConfig),
      })
      nuxt.options.alias['#cms-types'] = typesTemplate.dst

      addTemplate({
         filename: 'cms/graphql-env.d.ts',
         write: true,
         getContents: () => {
            const introspection = minifyIntrospection(
               introspectionFromSchema(buildSchema(renderGraphqlSdl(cmsConfig)))
            )
            return outputIntrospectionFile(introspection, {
               fileType: '.d.ts',
               shouldPreprocess: true,
            }).split("import * as gqlTada from 'gql.tada';")[0]!
         },
      })

      const gqlTadaTypesPath = resolveImport('gql.tada').replace(/\.[mc]?js$/, '')
      const graphqlTemplate = addTemplate({
         filename: 'cms/graphql.ts',
         write: true,
         getContents: () =>
            [
               `import type { initGraphQLTada, ResultOf, VariablesOf } from '${gqlTadaTypesPath}'`,
               `import type { introspection } from './graphql-env'`,
               ``,
               `export type CmsGraphql = initGraphQLTada<{`,
               `  introspection: introspection`,
               `  scalars: {`,
               `    JSON: unknown`,
               `  }`,
               `}>`,
               ``,
               `declare const graphql: CmsGraphql`,
               ``,
               `// @ts-ignore: gql.tada's cache overload rejects this instantiation, but the parse overload still resolves`,
               `export type CmsDocument<Query extends string> = ReturnType<typeof graphql<Query, []>>`,
               ``,
               `export type CmsResult<Query extends string> = string extends Query`,
               `  ? Record<string, unknown>`,
               `  : ResultOf<CmsDocument<Query>>`,
               ``,
               `export type CmsVariables<Query extends string> = string extends Query`,
               `  ? Record<string, unknown>`,
               `  : VariablesOf<CmsDocument<Query>>`,
               ``,
            ].join('\n'),
      })
      nuxt.options.alias['#cms-graphql'] = graphqlTemplate.dst

      addImports([
         { name: 'useCms', from: resolver.resolve('./runtime/app/composables/cms-query') },
         { name: '$cmsQuery', from: resolver.resolve('./runtime/app/composables/cms-query') },
      ])

      const {
         driver,
         path: dbPath,
         url: databaseUrl,
         authToken: databaseAuthToken,
      } = resolved.database
      nuxt.options.alias['#cms-db'] = resolver.resolve(
         driver === 'postgres'
            ? './runtime/server/utils/db-postgres'
            : driver === 'libsql'
              ? './runtime/server/utils/db-libsql'
              : './runtime/server/utils/db-sqlite'
      )

      const dialect =
         driver === 'postgres' ? 'postgresql' : driver === 'libsql' ? 'turso' : 'sqlite'
      const resolvedDbPath = isAbsolute(dbPath) ? dbPath : resolve(nuxt.options.rootDir, dbPath)
      const migrationsDir = resolve(nuxt.options.rootDir, `server/db/migrations/${driver}`)
      const relativeSchemaPath = relative(nuxt.options.rootDir, schemaTemplate.dst)
      const relativeMigrationsDir = relative(nuxt.options.rootDir, migrationsDir)

      const toPosix = (path: string) => path.replace(/\\/g, '/')
      addTemplate({
         filename: 'cms/drizzle.config.ts',
         write: true,
         getContents: () =>
            [
               `export default {`,
               `  dialect: '${dialect}',`,
               `  schema: '${toPosix(schemaTemplate.dst)}',`,
               `  out: '${toPosix(relativeMigrationsDir)}',`,
               driver === 'postgres'
                  ? `  dbCredentials: { url: process.env.NUXT_CMS_DATABASE_URL ?? '${databaseUrl}' },`
                  : driver === 'libsql'
                    ? `  dbCredentials: { url: process.env.NUXT_CMS_DATABASE_URL ?? '${
                         databaseUrl || `file:${toPosix(resolvedDbPath)}`
                      }', authToken: (process.env.NUXT_CMS_DATABASE_AUTH_TOKEN ?? '${databaseAuthToken}') || undefined },`
                    : `  dbCredentials: { url: '${toPosix(resolvedDbPath)}' },`,
               `}`,
               ``,
            ].join('\n'),
      })

      const publicDir = resolve(nuxt.options.rootDir, nuxt.options.dir?.public ?? 'public')
      const mediaLocalRoot =
         resolved.media.storage === 'local' && resolved.media.publicBaseUrl.startsWith('/')
            ? join(publicDir, ...resolved.media.publicBaseUrl.split('/').filter(Boolean))
            : ''

      addTemplate({
         filename: 'cms/media-manifest.d.ts',
         write: true,
         getContents: () =>
            renderMediaManifestTypes(
               toPosix(resolver.resolve('./runtime/server/utils/media-sync'))
            ),
      })

      const mediaManifestTemplate = addTemplate({
         filename: 'cms/media-manifest.js',
         write: true,
         getContents: async () => {
            if (!mediaLocalRoot || nuxt.options.dev) return renderMediaManifestFile(null)
            if (!existsSync(mediaLocalRoot)) {
               logger.warn(
                  `[nuxt-cms] Local media folder not found at build time: ${mediaLocalRoot}. The media library will not be synced at runtime.`
               )
               return renderMediaManifestFile(null)
            }
            return renderMediaManifestFile(await collectMediaManifest(mediaLocalRoot))
         },
      })
      nuxt.options.alias['#cms-media-manifest'] = mediaManifestTemplate.dst

      addServerPlugin(
         resolver.resolve(
            driver === 'postgres'
               ? './runtime/server/plugins/migrate-postgres'
               : driver === 'libsql'
                 ? './runtime/server/plugins/migrate-libsql'
                 : './runtime/server/plugins/migrate-sqlite'
         )
      )

      addServerPlugin(resolver.resolve('./runtime/server/plugins/media-sync-local'))

      if (!nuxt.options.dev) {
         addServerPlugin(resolver.resolve('./runtime/server/plugins/session-check'))
      }

      if (nuxt.options.dev) {
         let generated = false
         nuxt.hook('app:templatesGenerated', async () => {
            if (generated) return
            generated = true
            const bin = join(dirname(moduleRequire.resolve('drizzle-kit')), 'bin.cjs')
            const args = [
               bin,
               'generate',
               `--dialect=${dialect}`,
               `--schema=${relativeSchemaPath}`,
               `--out=${relativeMigrationsDir}`,
            ]
            const code = await new Promise<number>((done) => {
               spawn(process.execPath, args, { cwd: nuxt.options.rootDir, stdio: 'inherit' })
                  .on('close', (exitCode) => done(exitCode ?? 1))
                  .on('error', () => done(1))
            })
            if (code !== 0)
               logger.error(`[nuxt-cms] drizzle-kit generate failed (exit code ${code})`)
         })
      }

      const existingConfig = (nuxt.options.runtimeConfig.cms ?? {}) as Record<string, unknown>
      nuxt.options.runtimeConfig.cms = {
         adminEmail: resolved.admin.email,
         adminPassword: resolved.admin.password,
         databaseUrl,
         databaseAuthToken,
         dbPath: resolvedDbPath,
         migrationsDir,
         ...existingConfig,
         graphql: {
            graphiql: nuxt.options.dev,
            maxDepth: resolved.graphql.maxDepth,
            ...((existingConfig.graphql as Record<string, unknown>) ?? {}),
         },
         media: {
            storage: resolved.media.storage,
            endpoint: resolved.media.endpoint,
            region: resolved.media.region,
            bucket: resolved.media.bucket,
            presignExpiry: resolved.media.presignExpiry,
            maxFileSize: resolved.media.maxFileSize,
            accessKeyId: resolved.media.accessKeyId,
            secretAccessKey: resolved.media.secretAccessKey,
            localRoot: mediaLocalRoot,
            ...((existingConfig.media as Record<string, unknown>) ?? {}),
         },
      }
      nuxt.options.runtimeConfig.public.cms = {
         mediaBaseUrl: resolved.media.publicBaseUrl,
         mediaStorage: resolved.media.storage,
         mediaMaxFileSize: resolved.media.maxFileSize,
         i18n: resolved.i18n,
      }

      addTypeTemplate(
         {
            filename: 'types/nuxt-cms-auth.d.ts',
            getContents: () =>
               [
                  "import type { H3Event } from 'h3'",
                  '',
                  "declare module '#auth-utils' {",
                  '  interface User {',
                  '    email: string',
                  '  }',
                  '}',
                  '',
                  "declare module '#imports' {",
                  "  function getUserSession(event: H3Event): Promise<{ user?: import('#auth-utils').User }>",
                  "  function setUserSession(event: H3Event, session: { user: import('#auth-utils').User }): Promise<unknown>",
                  '}',
                  '',
                  'export {}',
                  '',
               ].join('\n'),
         },
         { nuxt: true, nitro: true }
      )

      addVitePlugin(tailwindcss())
      // defaultImport 'url' keeps the host's own `import x from './x.svg'` returning a
      // URL (unchanged); CmsIcon opts in explicitly via the `?component` query.
      addVitePlugin(svgLoader({ defaultImport: 'url', svgoConfig: { plugins: ['prefixIds'] } }))
      nuxt.options.css.push(
         resolveImport('@fontsource-variable/hanken-grotesk/index.css'),
         resolveImport('@fontsource/fragment-mono/index.css'),
         resolver.resolve('./runtime/assets/main.css')
      )

      nuxt.hook('app:templates', (app) => {
         app.layouts['cms-admin'] = {
            name: 'cms-admin',
            file: resolver.resolve('./runtime/app/layouts/cms-admin.vue'),
         }
      })
      addComponentsDir({ path: resolver.resolve('./runtime/app/components') })
      addRouteMiddleware({
         name: 'cms-auth',
         path: resolver.resolve('./runtime/app/middleware/cms-auth'),
      })

      extendPages((pages) => {
         pages.unshift(
            {
               name: 'cms-admin',
               path: '/cms',
               file: resolver.resolve('./runtime/app/pages/admin-index.vue'),
            },
            {
               name: 'cms-admin-login',
               path: '/cms/login',
               file: resolver.resolve('./runtime/app/pages/admin-login.vue'),
            },
            {
               name: 'cms-admin-media',
               path: '/cms/media',
               file: resolver.resolve('./runtime/app/pages/admin-media.vue'),
            },
            {
               name: 'cms-admin-collection',
               path: '/cms/:collection()',
               file: resolver.resolve('./runtime/app/pages/admin-collection.vue'),
            },
            {
               name: 'cms-admin-entry-new',
               path: '/cms/:collection()/new',
               file: resolver.resolve('./runtime/app/pages/admin-entry.vue'),
            },
            {
               name: 'cms-admin-entry',
               path: '/cms/:collection()/:id()',
               file: resolver.resolve('./runtime/app/pages/admin-entry.vue'),
            }
         )
      })

      addServerHandler({
         route: '/api/cms/auth/login',
         method: 'post',
         handler: resolver.resolve('./runtime/server/routes/auth/login.post'),
      })

      addServerHandler({
         route: '/api/cms/admin/media/presign',
         method: 'post',
         handler: resolver.resolve('./runtime/server/api/media-presign.post'),
      })
      addServerHandler({
         route: '/api/cms/admin/media',
         method: 'get',
         handler: resolver.resolve('./runtime/server/api/media.get'),
      })
      addServerHandler({
         route: '/api/cms/admin/media',
         method: 'post',
         handler: resolver.resolve('./runtime/server/api/media.post'),
      })
      addServerHandler({
         route: '/api/cms/admin/media',
         method: 'put',
         handler: resolver.resolve('./runtime/server/api/media.put'),
      })
      addServerHandler({
         route: '/api/cms/admin/media',
         method: 'delete',
         handler: resolver.resolve('./runtime/server/api/media.delete'),
      })

      const api = '/api/cms/admin/:collection'
      addServerHandler({
         route: api,
         method: 'get',
         handler: resolver.resolve('./runtime/server/api/collection.get'),
      })
      addServerHandler({
         route: api,
         method: 'post',
         handler: resolver.resolve('./runtime/server/api/collection.post'),
      })
      addServerHandler({
         route: api,
         method: 'put',
         handler: resolver.resolve('./runtime/server/api/collection.put'),
      })
      addServerHandler({
         route: `${api}/:id`,
         method: 'get',
         handler: resolver.resolve('./runtime/server/api/item.get'),
      })
      addServerHandler({
         route: `${api}/:id`,
         method: 'put',
         handler: resolver.resolve('./runtime/server/api/item.put'),
      })
      addServerHandler({
         route: `${api}/:id`,
         method: 'delete',
         handler: resolver.resolve('./runtime/server/api/item.delete'),
      })

      addServerHandler({
         route: '/api/cms/graphql',
         handler: resolver.resolve('./runtime/server/routes/graphql'),
      })
   },
})
