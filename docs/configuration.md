# Configuration

All configuration lives under the `cms` key in `nuxt.config.ts`, and every key is optional: the
`cms` key itself can be omitted entirely for a SQLite + S3 setup with an empty i18n config. The
authoritative type is `ModuleOptions` in [`../src/module.ts`](../src/module.ts). `database` and
`media` are discriminated unions keyed on `driver` / `storage`, so only the keys relevant to the
variant you pick are available; the others are rejected at the type level. Every secret also maps
to runtime config, so it can be provided as a `NUXT_CMS_*` environment variable instead of being
hardcoded.

## Options

```ts
cms: {
   enabled: true,                   // false keeps only the no-op composable stubs
   configPath: 'cms.config',        // path to the content-types file (without extension)
   admin: {
      email: '',                    // prefer NUXT_CMS_ADMIN_EMAIL
      password: '',                 // prefer NUXT_CMS_ADMIN_PASSWORD
   },
   database: { driver: 'sqlite' },  // the default; nothing else required
   media: { storage: 's3' },        // the default; endpoint/bucket/keys via env or below
   i18n: {
      locales: [],                  // e.g. ['en', 'it']; required for translatable fields
      defaultLocale: 'en',
   },
   graphql: {
      maxDepth: 8,                  // max query nesting depth (rejects deeper queries)
   },
}
```

### `database` per driver

```ts
// sqlite (default): nothing required
database: { driver: 'sqlite', path: 'data/cms.db' } // path defaults to 'data/cms.db'

// postgres: needs a connection string, in config or NUXT_CMS_DATABASE_URL
database: { driver: 'postgres', url: 'postgres://...' }

// libsql / Turso: url for remote, authToken only needed for remote
database: { driver: 'libsql', url: 'libsql://...', authToken: '...' }
```

`path` only exists on the `sqlite` variant; `url` / `authToken` only exist on `postgres` /
`libsql`. Mixing them is a type error.

### `media` per storage

```ts
// s3 (default): all keys optional here, usually provided via NUXT_CMS_MEDIA_* env vars
media: {
   storage: 's3',
   endpoint: '',
   region: 'auto',
   bucket: '',
   publicBaseUrl: '',            // public base URL for uploaded files
   presignExpiry: 600,           // seconds a presigned upload URL stays valid
   accessKeyId: '',
   secretAccessKey: '',
}

// local: read-only library synced from disk, publicBaseUrl is required
media: { storage: 'local', publicBaseUrl: '/images' }
```

The `local` variant does not accept the S3-only keys (`endpoint`, `bucket`, `accessKeyId`, etc.),
and requires `publicBaseUrl` since there is no other way to know which files to list.

### `enabled`

Whether the CMS is active. It exists so the module can stay in `modules[]` unconditionally, which
keeps `useCms` / `$cmsQuery` defined even in builds that ship no CMS. The value is resolved in this
order:

1. `cms.enabled` in `nuxt.config.ts`, when it is set to a boolean.
2. The `NUXT_CMS_ENABLED` env var, when it is defined: `1` / `true` enable, `0` / `false` / empty
   disable.
3. Enabled.

When disabled the module registers **only** stubs for `useCms` and `$cmsQuery`, with the same
signatures as the real ones. `useCms` returns a resolved `useAsyncData` result whose `data` is
`null`, `$cmsQuery` resolves to `{}`. Everything else is skipped: the admin pages, layout,
components and route middleware, all server handlers and plugins, the database aliases, the Drizzle
schema/config templates, migrations and the `nuxt-auth-utils` dependency. Components can therefore
call the composables unconditionally and render their empty states, with no crash at build, SSR
prerender or on the client.

Note that the generated aliases (`#cms-types`, `#cms-graphql`, `#cms-tables`, `#cms-db`) are not
registered when disabled, so application code must not import from them directly.

### `configPath`

Where the content-types file lives, relative to the project root and without extension
(default `cms.config`, resolved to `cms.config.ts`). If the file is missing the module boots with an
empty registry and logs a warning.

### `database`

Selects the driver and its connection. `driver` switches the runtime client, the Drizzle dialect,
the migration folder (`server/db/migrations/<driver>`) and the generated `drizzle.config.ts`
together. See [Database](database.md) for the details of each driver.

### `media`

S3-compatible object storage for the media library by default (`storage: 's3'`). When it is not
configured, media endpoints return `501` and media fields simply cannot be uploaded to. Set
`storage: 'local'` to make the media library read-only, listing files served from `publicBaseUrl`
by the host app instead of a bucket — no S3 config needed. In that mode a root-relative
`publicBaseUrl` (e.g. `/images` → `<rootDir>/public/images`) is also scanned at every server
startup, so the library mirrors the files on disk. See [Media](media.md).

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
