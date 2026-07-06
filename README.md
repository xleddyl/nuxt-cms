# nuxt-cms

nuxt-cms is a Nuxt module that leverages the Nitro server to ship a lightweight CMS together with your Nuxt frontend, no external CMS, no second service to deploy, nothing extra to pay for. Content lives next to the code that renders it: you define content types in code, editors manage entries from a built-in admin panel, and the same server that serves your site serves your content.

- **Zero extra infrastructure**: the CMS runs inside your app's Nitro server; you deploy one thing.
- **Content types in code**: a `cms.config.ts` with `defineCmsConfig()` declares collections, single documents, relations, blocks and translatable fields; database schema, migrations and TypeScript types are generated from it.
- **Admin panel at `/cms`**: entry editing with validation, drafts, media library (S3-compatible storage), single-admin auth from env credentials.
- **Public GraphQL API**: read-only, typed end-to-end via gql.tada, with filtering, sorting and pagination.
- **SQLite or Postgres**: a local file database by default, one config line to switch.

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
