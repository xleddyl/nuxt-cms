# nuxt-cms

nuxt-cms is a Nuxt module that leverages the Nitro server to ship a lightweight CMS together with your Nuxt frontend, no external CMS, no second service to deploy, nothing extra to pay for. Content lives next to the code that renders it: you define content types in code, editors manage entries from a built-in admin panel, and the same server that serves your site serves your content.

- **Zero extra infrastructure**: the CMS runs inside your app's Nitro server; you deploy one thing.
- **Content types in code**: a `cms.config.ts` with `defineCmsConfig()` declares collections, single documents, relations, blocks and translatable fields; database schema, migrations and TypeScript types are generated from it.
- **Admin panel at `/cms`**: entry editing with validation, drafts, media library (S3-compatible storage), single-admin auth from env credentials.
- **Public GraphQL API**: read-only, typed end-to-end via gql.tada, with filtering, sorting and pagination.
- **SQLite, Postgres or libSQL/Turso**: a local file database by default, one config line to switch (including remote SQLite over the network).

## Installation

```bash
npm install @xleddyl/nuxt-cms
```

Register the module and configure it under the `cms` key in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
   modules: ['@xleddyl/nuxt-cms'],
   cms: {
      database: {
         driver: 'sqlite', // 'sqlite' | 'postgres' (with `url`) | 'libsql' (Turso/remote, with `url` + `authToken`)
         path: 'data/cms.db',
      },
      i18n: {
         locales: ['en', 'it'],
         defaultLocale: 'en',
      },
   },
})
```

Then declare your content types in a `cms.config.ts` at the project root with `defineCmsConfig()`.

### Environment variables

Every secret maps to runtime config, so it can be set as an env var instead of in `nuxt.config.ts`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NUXT_CMS_ADMIN_EMAIL` | yes | admin login email |
| `NUXT_CMS_ADMIN_PASSWORD` | yes | admin login password |
| `NUXT_SESSION_PASSWORD` | in production | session encryption key (32+ chars) |
| `NUXT_CMS_DATABASE_URL` | with `postgres` / remote `libsql` | Postgres connection string or libSQL URL |
| `NUXT_CMS_DATABASE_AUTH_TOKEN` | with remote `libsql` | libSQL/Turso auth token |
| `NUXT_CMS_MEDIA_ENDPOINT` | for media | S3-compatible endpoint |
| `NUXT_CMS_MEDIA_REGION` | for media | S3 region (default `auto`) |
| `NUXT_CMS_MEDIA_BUCKET` | for media | bucket name |
| `NUXT_CMS_MEDIA_ACCESS_KEY_ID` | for media | S3 access key id |
| `NUXT_CMS_MEDIA_SECRET_ACCESS_KEY` | for media | S3 secret access key |
| `NUXT_PUBLIC_CMS_MEDIA_BASE_URL` | for media | public base URL for uploaded files |

## Documentation

Full documentation lives in [`docs/`](docs/README.md):

- [Getting started](docs/getting-started.md) — install, configure, first content type, run.
- [Configuration](docs/configuration.md) — every `cms.*` option and the `NUXT_CMS_*` env vars.
- [Database](docs/database.md) — SQLite, Postgres and libSQL/Turso drivers, migrations, studio.
- [Schema](docs/schema.md) — `defineCmsConfig`, entries, field types, relations, blocks, i18n.
- [Querying content](docs/querying.md) — GraphQL API, `useCms` / `$cmsQuery`, filters, sorting, pagination.
- [Admin panel & security](docs/admin.md) — pages, authentication, sessions, admin REST API.
- [Media](docs/media.md) — S3-compatible storage, upload flow, allowed file types.

## LLM guide

[llm.txt](llm.txt) is a compact reference meant to be fed to an LLM: schema definition (`cms.config.ts`, field types, relations, blocks, i18n), the `useCms` / `$cmsQuery` composables and the generated GraphQL API (filters, sorting, pagination).

## Development

```bash
pnpm install
pnpm dev:prepare  # module stub + playground prepare (first time and after module.ts changes)
pnpm dev          # playground on http://localhost:3000 (generates + applies migrations on boot)
pnpm db:studio    # drizzle studio
```

## Configuration

All config lives under `cms` in `nuxt.config.ts` (see `ModuleOptions` in `src/module.ts`); secrets map to runtime config, so they can be provided as `NUXT_CMS_*` env vars instead (plus `NUXT_SESSION_PASSWORD` for sessions in production). `cms.database.driver: 'postgres'` switches driver, drizzle dialect and migration folder together; re-run `dev:prepare` after switching.

## License

[MIT](LICENSE)
