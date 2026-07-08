# Configuration

All configuration lives under the `cms` key in `nuxt.config.ts`. The authoritative type is
`ModuleOptions` in [`../src/module.ts`](../src/module.ts). Every secret also maps to runtime config,
so it can be provided as a `NUXT_CMS_*` environment variable instead of being hardcoded.

## Options

```ts
cms: {
   configPath: 'cms.config',        // path to the content-types file (without extension)
   admin: {
      email: '',                    // prefer NUXT_CMS_ADMIN_EMAIL
      password: '',                 // prefer NUXT_CMS_ADMIN_PASSWORD
   },
   database: {
      driver: 'sqlite',             // 'sqlite' | 'postgres' | 'libsql'
      path: 'data/cms.db',          // file path for sqlite / local libsql
      url: '',                      // connection string for postgres / remote libsql
      authToken: '',                // libsql/Turso auth token (remote only)
   },
   media: {
      endpoint: '',                 // S3-compatible endpoint
      region: 'auto',
      bucket: '',
      publicBaseUrl: '',            // public base URL for uploaded files
      presignExpiry: 600,           // seconds a presigned upload URL stays valid
      accessKeyId: '',
      secretAccessKey: '',
   },
   i18n: {
      locales: [],                  // e.g. ['en', 'it']; required for translatable fields
      defaultLocale: 'en',
   },
   graphql: {
      maxDepth: 8,                  // max query nesting depth (rejects deeper queries)
   },
}
```

### `configPath`

Where the content-types file lives, relative to the project root and without extension
(default `cms.config`, resolved to `cms.config.ts`). If the file is missing the module boots with an
empty registry and logs a warning.

### `database`

Selects the driver and its connection. `driver` switches the runtime client, the Drizzle dialect,
the migration folder (`server/db/migrations/<driver>`) and the generated `drizzle.config.ts`
together. See [Database](database.md) for the details of each driver.

### `media`

S3-compatible object storage for the media library. When it is not configured, media endpoints
return `501` and media fields simply cannot be uploaded to. See [Media](media.md).

### `i18n`

`locales` / `defaultLocale` are only required when a field is marked `translatable: true`.
`defaultLocale` must be one of `locales`. This also feeds the admin UI language (English and Italian
ship built in). See [Schema → Translatable fields](schema.md#translatable-fields).

### `graphql.maxDepth`

Upper bound on GraphQL query nesting; deeper queries are rejected. Raise it if you have deeply
nested relations.

## Environment variables

Secrets should be provided as env vars rather than committed to `nuxt.config.ts`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NUXT_CMS_ADMIN_EMAIL` | yes | admin login email |
| `NUXT_CMS_ADMIN_PASSWORD` | yes | admin login password |
| `NUXT_SESSION_PASSWORD` | in production | session encryption key (min 32 chars) |
| `NUXT_CMS_DATABASE_URL` | with `postgres`, or remote `libsql` | connection string / libSQL URL |
| `NUXT_CMS_DATABASE_AUTH_TOKEN` | with remote `libsql` | libSQL/Turso auth token |
| `NUXT_CMS_MEDIA_ENDPOINT` | for media | S3-compatible endpoint |
| `NUXT_CMS_MEDIA_REGION` | for media | S3 region (default `auto`) |
| `NUXT_CMS_MEDIA_BUCKET` | for media | bucket name |
| `NUXT_CMS_MEDIA_ACCESS_KEY_ID` | for media | S3 access key id |
| `NUXT_CMS_MEDIA_SECRET_ACCESS_KEY` | for media | S3 secret access key |
| `NUXT_PUBLIC_CMS_MEDIA_BASE_URL` | for media | public base URL for uploaded files |

Env vars follow Nuxt's runtime-config convention: `cms.admin.email` ← `NUXT_CMS_ADMIN_EMAIL`,
`cms.database.url` ← `NUXT_CMS_DATABASE_URL`, and so on. Values set via env override the ones in
`nuxt.config.ts` at runtime.

> **Production:** the module refuses to boot without a valid `NUXT_SESSION_PASSWORD` (≥ 32
> characters). See [Admin panel & security](admin.md#sessions).
