# Database

nuxt-cms uses [Drizzle ORM](https://orm.drizzle.team). The Drizzle schema, migrations and TypeScript
types are generated from `cms.config.ts`. The `cms.database.driver` option switches the runtime
client, the Drizzle dialect, the migration folder (`server/db/migrations/<driver>`) and the
generated `drizzle.config.ts` together.

Four drivers are supported: **`sqlite`** (default), **`postgres`**, **`libsql`** (SQLite over
the network — Turso or a self-hosted `sqld`, or a local file), and **`d1`** (Cloudflare D1).

Only the client package for the driver you pick has to be installed. `better-sqlite3` is an optional
dependency and comes along by default; `pg` and `@libsql/client` are optional peer dependencies you
install yourself; `d1` needs nothing extra. Picking a driver whose package is missing fails the build
with an explicit message.

Which driver a given host can run is summarised in
[Deployment](deployment.md#host-and-driver-matrix).

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

Requires `pg`:

```bash
pnpm add pg
```

Prefer the `NUXT_CMS_DATABASE_URL` env var over hardcoding the `url`. A missing connection string
throws at first query.

Each server instance opens its own pool. `poolMax` caps it, which matters on serverless hosts where
many short-lived instances would otherwise exhaust the connection limit:

```ts
database: { driver: 'postgres', poolMax: 1 }
```

Leave it unset (or `0`) to use the `pg` default. See
[Deployment → Horizontal scaling](deployment.md#horizontal-scaling).

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

Requires `@libsql/client`:

```bash
pnpm add @libsql/client
```

Prefer env vars for both credentials:

```bash
NUXT_CMS_DATABASE_URL=libsql://your-db.turso.io
NUXT_CMS_DATABASE_AUTH_TOKEN=...
```

A remote URL uses the fetch-based libSQL client, so this driver also works on edge runtimes such as
Cloudflare Workers. The local-file path loads the native client lazily and is never pulled into an
edge bundle.

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

## Cloudflare D1

D1 is Cloudflare's SQLite-compatible database, reachable only from a Worker through a binding. The
schema, migrations and queries are the same as the `sqlite` driver.

```ts
cms: {
   database: { driver: 'd1', binding: 'DB' },
}
```

```toml
# wrangler.toml
[[d1_databases]]
binding = "DB"
database_name = "my-cms"
database_id = "..."
```

`binding` is the name you declared in `wrangler.toml` and defaults to `DB`. There is no connection
string and no client package to install: the binding is read from the Worker environment on each
request.

Two things behave differently from the other drivers:

- **No transactions.** D1 has no interactive transactions, so writes that span an entry and its
  many-to-many relations are not atomic. This affects the admin write path only.
- **Migrations run on the first request** of a Worker isolate rather than at boot, because
  Cloudflare forbids I/O in global scope.

Drizzle Studio is not configured for `d1`; use `wrangler d1 execute` instead. See
[Deployment → Cloudflare Workers](deployment.md#cloudflare-workers).

## Migrations

Migrations are generated from `cms.config.ts` into `server/db/migrations/<driver>` and **committed to
your repository**. Each driver has its own folder (`.../sqlite`, `.../postgres`, `.../libsql`,
`.../d1`); libSQL and D1 migrations are plain SQLite migrations.

At **build time** the module reads that folder and inlines the statements into the server bundle,
producing the same SHA-256 hashes Drizzle records in `__drizzle_migrations`. Nothing is read from
disk at runtime, which is what lets the CMS run on serverless hosts where `server/` is not part of
the deployed function. Switching to this from an older version re-applies nothing: the hashes match.

- **Dev:** on `dev`/`dev:prepare` the module runs `drizzle-kit generate`, and the server reads the
  folder directly so newly generated migrations apply without a rebuild. Restart dev after editing
  the schema.
- **Production:** the inlined migrations are applied on boot. If the folder was missing at build
  time the module warns during the build and the CMS tables will not exist.

To apply migrations from CI instead of on boot, set `migrateOnBoot: false` (or
`NUXT_CMS_MIGRATE_ON_BOOT=false`) and run `drizzle-kit migrate` against `.nuxt/cms/drizzle.config.ts`
in your pipeline. See [Deployment → Migrations](deployment.md#migrations).

## Drizzle Studio

A generated `drizzle.config.ts` (under `.nuxt/cms/`) lets you browse the database:

```bash
pnpm db:studio
```

For `libsql` the generated config uses the `turso` dialect with `{ url, authToken }`, so Studio works
against both remote databases and local files. For `d1` the config carries no credentials (the
database is only reachable through a Worker binding), so it drives `drizzle-kit generate` but not
Studio.

## Switching drivers

Changing `driver` switches dialect and migration folder together. After switching, re-run
`pnpm dev:prepare` so the schema and migrations for the new driver are generated. Data is **not**
migrated between drivers automatically.
