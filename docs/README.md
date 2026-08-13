# nuxt-cms documentation

nuxt-cms is a Nuxt module that ships a lightweight CMS inside your app's Nitro server: content
types are declared in code, editors manage entries from a built-in admin panel at `/cms`, and a
read-only GraphQL API serves the content to your frontend. No external CMS, no second service to
deploy.

## Table of contents

1. [Getting started](getting-started.md) — install, configure, first content type, run.
2. [Configuration](configuration.md) — every `cms.*` option and the `NUXT_CMS_*` env vars.
3. [Database](database.md) — SQLite, Postgres, libSQL/Turso and D1 drivers, migrations, studio.
4. [Schema](schema.md) — `defineCmsConfig`, entries, field types, relations, blocks, i18n.
5. [Querying content](querying.md) — GraphQL API, `useCms` / `$cmsQuery`, filters, sorting, pagination.
6. [Admin panel & security](admin.md) — pages, authentication, sessions, admin REST API.
7. [Media](media.md) — S3-compatible storage or file-backed local mode, upload flow, allowed file types.
8. [Deployment](deployment.md) — host/driver matrix, migrations on serverless, horizontal scaling, Cloudflare Workers.

## How it works in one paragraph

At build time the module reads `cms.config.ts`, validates it, and generates the Drizzle schema, the
GraphQL SDL, gql.tada types, the admin pages, and the migration statements that get inlined into the
server bundle. On server boot it applies the pending ones. The admin panel writes through its own
authenticated, internal API; your frontend reads through the public GraphQL endpoint at
`/api/cms/graphql`. Everything runs in the same Nitro server that renders your site, on a
long-running Node process or on a serverless host alike.

## Quick links

- Compact LLM reference: [`../llm.txt`](../llm.txt)
- Module options type: `ModuleOptions` in [`../src/module.ts`](../src/module.ts)
