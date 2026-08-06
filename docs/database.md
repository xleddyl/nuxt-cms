# Database

nuxt-cms uses [Drizzle ORM](https://orm.drizzle.team). The Drizzle schema, migrations and TypeScript
types are generated from `cms.config.ts`. The `cms.database.driver` option switches the runtime
client, the Drizzle dialect, the migration folder (`server/db/migrations/<driver>`) and the
generated `drizzle.config.ts` together.

Three drivers are supported: **`sqlite`** (default), **`postgres`**, and **`libsql`** (SQLite over
the network — Turso or a self-hosted `sqld`, or a local file).

## SQLite (default)

A local file database via `better-sqlite3`. Zero setup, ideal for development and single-instance
deployments.

```ts
cms: {
   database: { driver: 'sqlite', path: 'data/cms.db' },
}
```

- `path` is resolved relative to the project root (absolute paths are kept as-is).
- The parent directory is created automatically.
- WAL journaling and foreign keys are enabled.

## Postgres

A managed or self-hosted Postgres, via `pg`.

```ts
cms: {
   database: { driver: 'postgres', url: 'postgres://user:pass@host:5432/db' },
}
```

Prefer the `NUXT_CMS_DATABASE_URL` env var over hardcoding the `url`. A missing connection string
throws at first query.

## libSQL / Turso

libSQL is the SQLite fork behind [Turso](https://turso.tech). It uses the same SQLite dialect as the
default driver (schema, migrations and queries are identical), but the client can talk to a **remote
database over HTTP/WebSocket** in addition to a local file. Use it to host SQLite remotely on Turso
or a self-hosted `sqld`, while keeping SQLite semantics.

### Remote (Turso or self-hosted `sqld`)

```ts
cms: {
   database: {
      driver: 'libsql',
      url: 'libsql://your-db.turso.io',
      authToken: '...',
   },
}
```

Prefer env vars for both credentials:

```bash
NUXT_CMS_DATABASE_URL=libsql://your-db.turso.io
NUXT_CMS_DATABASE_AUTH_TOKEN=...
```

### Local file

Omit `url` and libSQL connects to the same local file as the `sqlite` driver
(`file:data/cms.db`), just through the libSQL client instead:

```ts
cms: {
   database: { driver: 'libsql' },
}
```

If you need a custom file path, use `driver: 'sqlite'` instead: the `libsql` variant does not
accept a `path` option, only `url` / `authToken`.

### How the URL is resolved

- If `url` (or `NUXT_CMS_DATABASE_URL`) is set → **remote**, that URL is used.
- Otherwise → **local file**, `file:data/cms.db` is used and the directory is created.

## Migrations

Migrations are generated from `cms.config.ts` and applied automatically:

- **Dev:** on `dev`/`dev:prepare` the module runs `drizzle-kit generate` and applies pending
  migrations on server boot. Restart dev after editing the schema.
- **Production:** the generated migrations under `server/db/migrations/<driver>` are applied on boot.
  Commit and deploy that folder — if it is missing, the CMS tables will not exist and the server
  logs an error.

Each driver has its own migration folder (`.../migrations/sqlite`, `.../postgres`, `.../libsql`).
libSQL migrations are plain SQLite migrations.

## Drizzle Studio

A generated `drizzle.config.ts` (under `.nuxt/cms/`) lets you browse the database:

```bash
pnpm db:studio
```

For `libsql` the generated config uses the `turso` dialect with `{ url, authToken }`, so Studio works
against both remote databases and local files.

## Switching drivers

Changing `driver` switches dialect and migration folder together. After switching, re-run
`pnpm dev:prepare` so the schema and migrations for the new driver are generated. Data is **not**
migrated between drivers automatically.
