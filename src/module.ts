import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
   addComponent,
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
import { renderBrandFile, resolveBrand } from './brand-codegen'
import { renderGraphqlSdl } from './runtime/shared/graphql-sdl'
import { migrationsDirFor } from './runtime/shared/migrations-dir'
import type { CmsConfig, CmsPageRoute, MediaStorageMode } from './runtime/shared/index'
import { DEFAULT_MEDIA_MAX_FILE_SIZE, normalizeCmsConfig } from './runtime/shared/index'
import {
   collectBlockComponents,
   collectPreviewComponents,
   missingBlockComponents,
   missingPreviewComponents,
   renderBlocksFile,
} from './blocks-codegen'
import { DEFAULT_CMS_PREVIEW_PATH, previewPathErrors } from './runtime/shared/preview'
import {
   collectMediaManifest,
   renderMediaManifestFile,
   renderMediaManifestTypes,
} from './media-manifest-codegen'
import {
   collectMigrations,
   renderMigrationsFile,
   renderMigrationsTypes,
} from './migrations-codegen'
import type { Driver } from './schema-codegen'
import { renderSchemaFile, validateConfig } from './schema-codegen'
import { renderQueriesFile } from './queries-codegen'
import { resolvePageRoutes, routePathsFromDir } from './runtime/shared/page-routes'
import { renderTypesFile } from './types-codegen'
import { CMS_ENABLED_ENV, resolveCmsEnabled } from './enabled'

export type ModuleOptionsDatabase = { migrateOnBoot?: boolean } & (
   | { driver?: 'sqlite'; path?: string }
   | { driver: 'postgres'; url?: string; poolMax?: number }
   | { driver: 'libsql'; url?: string; authToken?: string }
   | { driver: 'd1'; binding?: string }
)

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
   | { storage: 'filesystem'; dir?: string; publicBaseUrl?: string; maxFileSize?: number }

export interface ModuleOptions {
   enabled?: boolean
   configPath?: string
   admin?: {
      email?: string
      password?: string
      title?: string
      subtitle?: string
      logo?: string
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
   preview?: {
      path?: string
      component?: string
   }
}

interface ResolvedModuleOptions {
   configPath: string
   admin: {
      email: string
      password: string
      title: string
      subtitle: string | undefined
      logo: string
   }
   database: {
      driver: Driver
      path: string
      url: string
      authToken: string
      binding: string
      migrateOnBoot: boolean
      poolMax: number
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
      dir: string
   }
   i18n: {
      locales: string[]
      defaultLocale: string
   }
   graphql: {
      maxDepth: number
   }
   preview: {
      path: string
      component: string
   }
}

function resolveDatabaseOptions(
   database: ModuleOptions['database']
): ResolvedModuleOptions['database'] {
   const shared = {
      migrateOnBoot: database?.migrateOnBoot ?? true,
      poolMax: 0,
      binding: '',
      path: 'data/cms.db',
      url: '',
      authToken: '',
   }
   if (database?.driver === 'postgres') {
      return {
         ...shared,
         driver: 'postgres',
         url: database.url ?? '',
         poolMax: database.poolMax ?? 0,
      }
   }
   if (database?.driver === 'libsql') {
      return {
         ...shared,
         driver: 'libsql',
         url: database.url ?? '',
         authToken: database.authToken ?? '',
      }
   }
   if (database?.driver === 'd1') {
      return { ...shared, driver: 'd1', binding: database.binding ?? 'DB' }
   }
   return { ...shared, driver: 'sqlite', path: database?.path ?? 'data/cms.db' }
}

const DEFAULT_FILESYSTEM_MEDIA_DIR = 'data/media'
const DEFAULT_FILESYSTEM_MEDIA_BASE_URL = '/media'

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
         dir: '',
      }
   }
   if (media?.storage === 'filesystem') {
      return {
         storage: 'filesystem',
         endpoint: '',
         region: 'auto',
         bucket: '',
         accessKeyId: '',
         secretAccessKey: '',
         presignExpiry: 600,
         maxFileSize: media.maxFileSize ?? DEFAULT_MEDIA_MAX_FILE_SIZE,
         publicBaseUrl: media.publicBaseUrl || DEFAULT_FILESYSTEM_MEDIA_BASE_URL,
         dir: media.dir || DEFAULT_FILESYSTEM_MEDIA_DIR,
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
      dir: '',
   }
}

function resolveModuleOptions(options: ModuleOptions): ResolvedModuleOptions {
   return {
      configPath: options.configPath ?? 'cms.config',
      admin: {
         email: options.admin?.email ?? '',
         password: options.admin?.password ?? '',
         title: options.admin?.title ?? '',
         subtitle: options.admin?.subtitle,
         logo: options.admin?.logo ?? '',
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
      preview: {
         path: options.preview?.path ?? DEFAULT_CMS_PREVIEW_PATH,
         component: options.preview?.component?.trim() ?? '',
      },
   }
}

const moduleRequire = createRequire(import.meta.url)

function resolveImport(specifier: string) {
   try {
      return fileURLToPath(import.meta.resolve(specifier)).replace(/\\/g, '/')
   } catch {
      return moduleRequire.resolve(specifier).replace(/\\/g, '/')
   }
}

async function loadCmsConfig(
   nuxt: Nuxt,
   resolver: ReturnType<typeof createResolver>,
   configPathOption: string,
   i18n: ResolvedModuleOptions['i18n'],
   logger: ReturnType<typeof useLogger>
): Promise<CmsConfig> {
   const configPath = await resolvePath(configPathOption, { cwd: nuxt.options.rootDir })
   nuxt.options.alias['#nuxt-cms'] = resolver.resolve('./runtime/shared/index')
   nuxt.options.watch.push(configPath)

   let cmsConfig: CmsConfig = {}
   if (existsSync(configPath)) {
      nuxt.options.alias['#cms-config'] = configPath
      const jiti = createJiti(import.meta.url, {
         moduleCache: false,
         alias: { '#nuxt-cms': resolver.resolve('./runtime/shared/index') },
      })
      cmsConfig = normalizeCmsConfig(
         (await jiti.import(configPath, { default: true })) as CmsConfig,
         i18n
      )
   } else {
      logger.warn(
         `[nuxt-cms] Config file not found: ${configPath}. Using an empty registry. Create a ${configPathOption}.ts with defineCmsConfig().`
      )
      nuxt.options.alias['#cms-config'] = resolver.resolve('./runtime/shared/empty-config')
   }

   const pagesDir = join(
      nuxt.options.srcDir ?? nuxt.options.rootDir,
      nuxt.options.dir?.pages ?? 'pages'
   )
   const discoveredRoutes = routePathsFromDir(pagesDir)
   const routesByEntry: Record<string, CmsPageRoute[]> = {}
   for (const [name, entry] of Object.entries(cmsConfig)) {
      if (entry.kind !== 'page') continue
      entry.pages = resolvePageRoutes(entry, discoveredRoutes)
      routesByEntry[name] = entry.pages
   }

   const source = (nuxt.options.alias['#cms-config'] ?? '')
      .replace(/\\/g, '/')
      .replace(/\.[cm]?[jt]s$/, '')
   const wrapper = addTemplate({
      filename: 'cms/config.ts',
      write: true,
      getContents: () =>
         [
            `import { normalizeCmsConfig } from '#nuxt-cms'`,
            `import config from '${source}'`,
            ``,
            `const pageRoutes = ${JSON.stringify(routesByEntry, null, 3)}`,
            ``,
            `normalizeCmsConfig(config, ${JSON.stringify({ locales: i18n.locales })})`,
            ``,
            `for (const [name, routes] of Object.entries(pageRoutes)) {`,
            `   const entry = Object(config)[name]`,
            `   if (entry) entry.pages = routes`,
            `}`,
            ``,
            `export default config`,
            ``,
         ].join('\n'),
   })
   nuxt.options.alias['#cms-config'] = wrapper.dst

   const configErrors = validateConfig(cmsConfig, i18n)
   if (configErrors.length) {
      for (const error of configErrors) logger.error(error)
      throw new Error(
         `[nuxt-cms] Invalid cms config (${configErrors.length} error${
            configErrors.length > 1 ? 's' : ''
         })`
      )
   }

   return cmsConfig
}

function addCmsTypeTemplates(nuxt: Nuxt, cmsConfig: CmsConfig) {
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

   const queriesTemplate = addTemplate({
      filename: 'cms/queries.ts',
      write: true,
      getContents: () => renderQueriesFile(cmsConfig),
   })
   nuxt.options.alias['#cms-queries'] = queriesTemplate.dst

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
            `// @ts-ignore`,
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
}

function addCmsBlocks(
   nuxt: Nuxt,
   resolver: ReturnType<typeof createResolver>,
   cmsConfig: CmsConfig,
   previewComponent: string
) {
   const refs = collectBlockComponents(cmsConfig)
   const previews = collectPreviewComponents(cmsConfig, previewComponent)
   const blocksTemplate = addTemplate({
      filename: 'cms/blocks.ts',
      write: true,
      getContents: () => renderBlocksFile(refs, previews),
   })
   nuxt.options.alias['#cms-blocks'] = blocksTemplate.dst
   addComponent({
      name: 'CmsBlocks',
      filePath: resolver.resolve('./runtime/app/blocks/CmsBlocks.vue'),
   })
   if (!refs.length && !previews.length) return
   nuxt.hook('components:extend', (components) => {
      const names = components.map((component) => component.pascalName)
      const errors = [
         ...missingBlockComponents(refs, names),
         ...missingPreviewComponents(previews, names),
      ]
      if (errors.length)
         throw new Error(`[nuxt-cms] Invalid block components:\n${errors.join('\n')}`)
   })
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
         migrateOnBoot: true,
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
         const queryStub = resolver.resolve('./runtime/app/composables/cms-query-disabled')
         const entryStub = resolver.resolve('./runtime/app/composables/cms-entry-disabled')
         addImports([
            { name: 'useCms', from: queryStub },
            { name: '$cmsQuery', from: queryStub },
            { name: 'useCmsSingle', from: entryStub },
            { name: 'useCmsCollection', from: entryStub },
            { name: 'useCmsPage', from: entryStub },
            { name: 'useCmsContents', from: entryStub },
            { name: 'useCmsContent', from: entryStub },
         ])
         const disabledConfig = await loadCmsConfig(
            nuxt,
            resolver,
            resolved.configPath,
            resolved.i18n,
            logger
         )
         addCmsTypeTemplates(nuxt, disabledConfig)
         addCmsBlocks(nuxt, resolver, disabledConfig, resolved.preview.component)
         nuxt.options.runtimeConfig.public.cms = {
            mediaBaseUrl: resolved.media.publicBaseUrl,
            mediaStorage: resolved.media.storage,
            mediaMaxFileSize: resolved.media.maxFileSize,
            i18n: resolved.i18n,
            previewPath: resolved.preview.path,
         }
         logger.info(
            '[nuxt-cms] disabled: registering no-op query composables and generated types, skipping admin, server and database setup'
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

      const cmsConfig = await loadCmsConfig(
         nuxt,
         resolver,
         resolved.configPath,
         resolved.i18n,
         logger
      )

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

      addCmsTypeTemplates(nuxt, cmsConfig)

      const queryComposables = resolver.resolve('./runtime/app/composables/cms-query')
      const entryComposables = resolver.resolve('./runtime/app/composables/cms-entry')
      addImports([
         { name: 'useCms', from: queryComposables },
         { name: '$cmsQuery', from: queryComposables },
         { name: 'useCmsSingle', from: entryComposables },
         { name: 'useCmsCollection', from: entryComposables },
         { name: 'useCmsPage', from: entryComposables },
         { name: 'useCmsContents', from: entryComposables },
         { name: 'useCmsContent', from: entryComposables },
      ])
      addCmsBlocks(nuxt, resolver, cmsConfig, resolved.preview.component)

      const previewErrors = previewPathErrors(resolved.preview.path, Object.keys(cmsConfig))
      if (previewErrors.length) throw new Error(`[nuxt-cms] ${previewErrors.join('\n')}`)
      const previewPath = resolved.preview.path
      const previewRule = nuxt.options.routeRules?.[previewPath] ?? {}
      nuxt.options.routeRules = {
         ...nuxt.options.routeRules,
         [previewPath]: {
            ...previewRule,
            headers: {
               'x-robots-tag': 'noindex, nofollow',
               'x-frame-options': 'SAMEORIGIN',
               ...previewRule.headers,
            },
         },
      }

      const {
         driver,
         path: dbPath,
         url: databaseUrl,
         authToken: databaseAuthToken,
         binding: d1Binding,
         migrateOnBoot,
         poolMax,
      } = resolved.database
      nuxt.options.alias['#cms-db'] = resolver.resolve(
         driver === 'postgres'
            ? './runtime/server/utils/db-postgres'
            : driver === 'libsql'
              ? './runtime/server/utils/db-libsql'
              : driver === 'd1'
                ? './runtime/server/utils/db-d1'
                : './runtime/server/utils/db-sqlite'
      )

      const driverPackage =
         driver === 'postgres' ? 'pg' : driver === 'libsql' ? '@libsql/client' : 'better-sqlite3'
      if (driver !== 'd1') {
         try {
            resolveImport(driverPackage)
         } catch {
            throw new Error(
               `[nuxt-cms] database.driver is '${driver}' but '${driverPackage}' is not installed. Install it in your app (e.g. pnpm add ${driverPackage}); only the client for the driver you use is required.`
            )
         }
      }

      const dialect =
         driver === 'postgres' ? 'postgresql' : driver === 'libsql' ? 'turso' : 'sqlite'
      const resolvedDbPath = isAbsolute(dbPath) ? dbPath : resolve(nuxt.options.rootDir, dbPath)
      const migrationsDir = migrationsDirFor(nuxt.options.rootDir, driver)
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
                  ? `  dbCredentials: { url: process.env.NUXT_CMS_DATABASE_URL },`
                  : driver === 'libsql'
                    ? databaseUrl
                       ? `  dbCredentials: { url: process.env.NUXT_CMS_DATABASE_URL, authToken: process.env.NUXT_CMS_DATABASE_AUTH_TOKEN || undefined },`
                       : `  dbCredentials: { url: ${JSON.stringify(
                            `file:${toPosix(resolvedDbPath)}`
                         )} },`
                    : driver === 'd1'
                      ? ``
                      : `  dbCredentials: { url: ${JSON.stringify(toPosix(resolvedDbPath))} },`,
               `}`,
               ``,
            ].join('\n'),
      })

      addTemplate({
         filename: 'cms/migrations.d.ts',
         write: true,
         getContents: () =>
            renderMigrationsTypes(toPosix(resolver.resolve('./runtime/server/utils/migrate'))),
      })

      const migrationsTemplate = addTemplate({
         filename: 'cms/migrations.js',
         write: true,
         getContents: async () => {
            const migrations = await collectMigrations(migrationsDir)
            if (!migrations && !nuxt.options.dev && Object.keys(cmsConfig).length) {
               logger.warn(
                  `[nuxt-cms] No migrations found at ${migrationsDir}. The CMS tables will not be created. Run the dev server once to generate them and commit ${toPosix(
                     relativeMigrationsDir
                  )}.`
               )
            }
            return renderMigrationsFile(migrations)
         },
      })
      nuxt.options.alias['#cms-migrations'] = migrationsTemplate.dst

      const publicDir = resolve(nuxt.options.rootDir, nuxt.options.dir?.public ?? 'public')
      const mediaLocalRoot =
         resolved.media.storage === 'local' && resolved.media.publicBaseUrl.startsWith('/')
            ? join(publicDir, ...resolved.media.publicBaseUrl.split('/').filter(Boolean))
            : ''

      if (resolved.media.storage === 'local' && !mediaLocalRoot) {
         logger.warn(
            `[nuxt-cms] media.storage is 'local' but media.publicBaseUrl (${
               resolved.media.publicBaseUrl || 'empty'
            }) is not a root-relative path, so no folder can be read: the media library will be empty. Set it to something like '/images'.`
         )
      }

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
            if (!mediaLocalRoot || nuxt.options.dev) return renderMediaManifestFile(null, null)
            if (!existsSync(mediaLocalRoot)) {
               logger.warn(
                  `[nuxt-cms] Local media folder not found at build time: ${mediaLocalRoot}. The media library will be empty at runtime.`
               )
               return renderMediaManifestFile(null, null)
            }
            return renderMediaManifestFile(
               await collectMediaManifest(mediaLocalRoot),
               new Date().toISOString()
            )
         },
      })
      nuxt.options.alias['#cms-media-manifest'] = mediaManifestTemplate.dst

      addServerPlugin(
         resolver.resolve(
            driver === 'postgres'
               ? './runtime/server/plugins/migrate-postgres'
               : driver === 'libsql'
                 ? './runtime/server/plugins/migrate-libsql'
                 : driver === 'd1'
                   ? './runtime/server/plugins/d1-binding'
                   : './runtime/server/plugins/migrate-sqlite'
         )
      )

      addServerPlugin(resolver.resolve('./runtime/server/plugins/session-validate'))

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

      const mediaFilesystemBase =
         resolved.media.storage === 'filesystem'
            ? `/${resolved.media.publicBaseUrl.split('/').filter(Boolean).join('/')}`
            : ''
      if (
         resolved.media.storage === 'filesystem' &&
         !resolved.media.publicBaseUrl.startsWith('/')
      ) {
         throw new Error(
            `[nuxt-cms] media.storage is 'filesystem' but media.publicBaseUrl (${
               resolved.media.publicBaseUrl || 'empty'
            }) is not a root-relative path. Set it to something like '/media': the module serves the uploaded files there.`
         )
      }
      if (mediaFilesystemBase === '/' || mediaFilesystemBase.startsWith('/api/')) {
         throw new Error(
            `[nuxt-cms] media.publicBaseUrl (${resolved.media.publicBaseUrl}) cannot serve the uploaded files: pick a dedicated path such as '/media'.`
         )
      }
      const mediaDir =
         resolved.media.storage === 'filesystem'
            ? isAbsolute(resolved.media.dir)
               ? resolved.media.dir
               : resolve(nuxt.options.rootDir, resolved.media.dir)
            : ''

      const existingConfig = (nuxt.options.runtimeConfig.cms ?? {}) as Record<string, unknown>
      nuxt.options.runtimeConfig.cms = {
         adminEmail: resolved.admin.email,
         adminPassword: resolved.admin.password,
         databaseUrl,
         databaseAuthToken,
         dbPath: resolvedDbPath,
         migrationsDir,
         migrateOnBoot,
         poolMax,
         d1Binding,
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
            dir: mediaDir,
            ...((existingConfig.media as Record<string, unknown>) ?? {}),
         },
      }
      nuxt.options.runtimeConfig.public.cms = {
         mediaBaseUrl: resolved.media.publicBaseUrl,
         mediaStorage: resolved.media.storage,
         mediaMaxFileSize: resolved.media.maxFileSize,
         i18n: resolved.i18n,
         previewPath,
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
                  '    id?: string',
                  '    email: string',
                  '    name?: string | null',
                  "    role?: 'superadmin' | 'admin'",
                  '    firstLogin?: boolean',
                  '    passwordStamp?: string',
                  '  }',
                  '}',
                  '',
                  "declare module '#imports' {",
                  "  function getUserSession(event: H3Event): Promise<{ user?: import('#auth-utils').User }>",
                  "  function setUserSession(event: H3Event, session: { user: import('#auth-utils').User }): Promise<unknown>",
                  "  function replaceUserSession(event: H3Event, session: { user: import('#auth-utils').User }): Promise<unknown>",
                  '  function clearUserSession(event: H3Event): Promise<boolean>',
                  "  const sessionHooks: { hook(name: 'fetch', fn: (session: { user?: import('#auth-utils').User }, event: H3Event) => void | Promise<void>): () => void }",
                  '  function useStorage(base?: string): {',
                  '    getItem<T>(key: string): Promise<T | null>',
                  '    setItem<T>(key: string, value: T, options?: { ttl?: number }): Promise<void>',
                  '    removeItem(key: string): Promise<void>',
                  '    getKeys(base?: string): Promise<string[]>',
                  '  }',
                  '}',
                  '',
                  'export {}',
                  '',
               ].join('\n'),
         },
         { nuxt: true, nitro: true }
      )

      const brandPaths = {
         rootDir: nuxt.options.rootDir,
         srcDir: nuxt.options.srcDir ?? nuxt.options.rootDir,
      }
      const { file: brandFile } = resolveBrand(resolved.admin, brandPaths)
      if (brandFile) nuxt.options.watch.push(brandFile)
      const brandTemplate = addTemplate({
         filename: 'cms/brand.ts',
         write: true,
         getContents: () => renderBrandFile(resolveBrand(resolved.admin, brandPaths).brand),
      })
      nuxt.options.alias['#cms-brand'] = brandTemplate.dst

      addVitePlugin(tailwindcss())
      addVitePlugin(svgLoader({ defaultImport: 'url', svgoConfig: { plugins: ['prefixIds'] } }))
      nuxt.options.css.push(
         resolveImport('@fontsource-variable/geist/index.css'),
         resolveImport('@fontsource-variable/geist-mono/index.css'),
         resolver.resolve('./runtime/assets/main.css')
      )

      nuxt.hook('app:templates', (app) => {
         app.layouts['cms-admin'] = {
            name: 'cms-admin',
            file: resolver.resolve('./runtime/app/layouts/cms-admin.vue'),
         }
         app.layouts['cms-editor'] = {
            name: 'cms-editor',
            file: resolver.resolve('./runtime/app/layouts/cms-editor.vue'),
         }
      })
      addComponentsDir({ path: resolver.resolve('./runtime/app/components') })
      addRouteMiddleware({
         name: 'cms-auth',
         path: resolver.resolve('./runtime/app/middleware/cms-auth'),
      })

      const contentPages = Object.entries(cmsConfig)
         .filter(([, entry]) => entry.kind === 'content')
         .flatMap(([name]) => [
            {
               name: `cms-admin-content-${name}-new`,
               path: `/cms/${name}/new`,
               file: resolver.resolve('./runtime/app/pages/admin-content.vue'),
               meta: { cmsEntry: name },
            },
            {
               name: `cms-admin-content-${name}`,
               path: `/cms/${name}/:id()`,
               file: resolver.resolve('./runtime/app/pages/admin-content.vue'),
               meta: { cmsEntry: name },
            },
         ])

      extendPages((pages) => {
         pages.unshift(
            {
               name: 'cms-preview',
               path: previewPath,
               file: resolver.resolve('./runtime/app/pages/admin-preview.vue'),
            },
            ...contentPages,
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
      addServerHandler({
         route: '/api/cms/admin/media/folders',
         method: 'post',
         handler: resolver.resolve('./runtime/server/api/media-folder.post'),
      })
      addServerHandler({
         route: '/api/cms/admin/media/folders',
         method: 'delete',
         handler: resolver.resolve('./runtime/server/api/media-folder.delete'),
      })
      addServerHandler({
         route: '/api/cms/admin/media/folders',
         method: 'patch',
         handler: resolver.resolve('./runtime/server/api/media-folder.patch'),
      })
      addServerHandler({
         route: '/api/cms/admin/media/move',
         method: 'post',
         handler: resolver.resolve('./runtime/server/api/media-move.post'),
      })
      addServerHandler({
         route: '/api/cms/admin/media/delete',
         method: 'post',
         handler: resolver.resolve('./runtime/server/api/media-delete.post'),
      })
      addServerHandler({
         route: '/api/cms/admin/media/usage',
         method: 'post',
         handler: resolver.resolve('./runtime/server/api/media-usage.post'),
      })
      addServerHandler({
         route: '/api/cms/admin/media/download',
         method: 'get',
         handler: resolver.resolve('./runtime/server/api/media-download.get'),
      })

      if (mediaFilesystemBase) {
         addServerHandler({
            route: '/api/cms/admin/media/upload',
            method: 'put',
            handler: resolver.resolve('./runtime/server/api/media-upload.put'),
         })
         addServerHandler({
            route: `${mediaFilesystemBase}/**`,
            handler: resolver.resolve('./runtime/server/routes/media-file'),
         })
      }

      addServerHandler({
         route: '/api/cms/search',
         method: 'get',
         handler: resolver.resolve('./runtime/server/api/search.get'),
      })
      addServerHandler({
         route: '/api/cms/users',
         method: 'get',
         handler: resolver.resolve('./runtime/server/api/users.get'),
      })
      addServerHandler({
         route: '/api/cms/users',
         method: 'post',
         handler: resolver.resolve('./runtime/server/api/users.post'),
      })
      addServerHandler({
         route: '/api/cms/users/:id',
         method: 'put',
         handler: resolver.resolve('./runtime/server/api/user.put'),
      })
      addServerHandler({
         route: '/api/cms/users/:id',
         method: 'delete',
         handler: resolver.resolve('./runtime/server/api/user.delete'),
      })
      addServerHandler({
         route: '/api/cms/account',
         method: 'put',
         handler: resolver.resolve('./runtime/server/api/account.put'),
      })
      addServerHandler({
         route: '/api/cms/account/password',
         method: 'put',
         handler: resolver.resolve('./runtime/server/api/account-password.put'),
      })
      addServerHandler({
         route: '/api/cms/account/welcome',
         method: 'post',
         handler: resolver.resolve('./runtime/server/api/account-welcome.post'),
      })
      addServerHandler({
         route: '/api/cms/admin/settings',
         method: 'get',
         handler: resolver.resolve('./runtime/server/api/settings.get'),
      })
      addServerHandler({
         route: '/api/cms/admin/settings/:key',
         method: 'put',
         handler: resolver.resolve('./runtime/server/api/settings.put'),
      })
      addServerHandler({
         route: '/api/cms/admin/settings/:key',
         method: 'delete',
         handler: resolver.resolve('./runtime/server/api/settings.delete'),
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
