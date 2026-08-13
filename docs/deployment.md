# Deployment

nuxt-cms ships inside your Nitro server, so deploying the CMS means deploying your Nuxt app. There
is no second service, no control plane, no vendor. What changes between hosts is which database
driver can reach your data and where uploaded media lives.

## Host and driver matrix

| Host | `sqlite` | `postgres` | `libsql` (remote) | `d1` |
| --- | --- | --- | --- | --- |
| Long-running Node (VPS, Docker, Fly, Railway) | yes | yes | yes | no |
| Node serverless (Vercel, Netlify, AWS Lambda) | no | yes | yes | no |
| Cloudflare Workers | no | no | yes | yes |

`sqlite` writes to a local file, so it needs a real, persistent filesystem and a single writer. Every
other driver talks to a database over the network and works with as many instances as you like.

On Cloudflare Workers, `postgres` is unavailable because the `pg` driver needs raw TCP sockets. Use
`libsql` (Turso) or `d1`.

## What is stateless

Everything on the request path is stateless by construction, which is what makes horizontal scaling
safe:

- **Media uploads** go straight from the browser to your bucket with a presigned URL. The server
  signs the URL and records the row; the file never passes through it, so there is no temp directory
  and no upload size tied to instance memory. See [Media](media.md#upload-flow-s3-mode).
- **Sessions** are sealed cookies (`nuxt-auth-utils`). No session store, no sticky sessions.
- **GraphQL DataLoaders** are created per request, not shared across requests.
- **The media library** is read per environment, never reconciled into shared state, so several
  deployments can point at the same database without fighting each other. See
  [Media](media.md#why-there-is-no-sync).
- **Migrations** are baked into the server bundle at build time (see below), so nothing is read from
  disk at runtime.

The one piece of per-instance state is the **login rate limiter**, covered under
[Horizontal scaling](#horizontal-scaling).

## Migrations

Migrations are generated from `cms.config.ts` into `server/db/migrations/<driver>` and **committed to
your repository**. At build time the module reads that folder and inlines the statements into the
server bundle, exactly as Drizzle would have read them from disk, with the same SHA-256 hashes in
`__drizzle_migrations`. At runtime nothing touches the filesystem.

This is what makes serverless work: on Vercel, Netlify or Workers the `server/` folder is not part of
the deployed function, so reading migrations at runtime would find nothing.

By default the pending migrations are applied when the server boots:

```ts
cms: {
   database: { driver: 'postgres', migrateOnBoot: true },  // the default
}
```

On a serverless host "boot" means every cold start. That is cheap (one query when there is nothing
to apply) but if you would rather migrate once in CI, turn it off:

```bash
NUXT_CMS_MIGRATE_ON_BOOT=false
```

and apply the migrations from your pipeline with `drizzle-kit migrate` against the generated config
in `.nuxt/cms/drizzle.config.ts` before the new version goes live.

If the migrations folder is missing at build time the module warns and the CMS tables will not
exist. Run the dev server once to generate them, then commit the folder.

### D1

D1 has no interactive transactions, so the D1 driver applies migrations through D1's own atomic
`batch()` on the first request of an isolate rather than at boot: Cloudflare forbids I/O in global
scope, and the binding is only reachable from a request. The first request after a deploy pays for
it; the rest do not.

## Database driver packages

Only the client for the driver you actually use needs to be installed. `better-sqlite3` comes as an
optional dependency (so the default driver works with no extra step, and an install on a platform
without a native build does not fail); `pg` and `@libsql/client` are optional peer dependencies:

```bash
pnpm add pg                # driver: 'postgres'
pnpm add @libsql/client    # driver: 'libsql'
```

`d1` needs nothing beyond `drizzle-orm`.

The build fails with an explicit message if the selected driver's package is missing, rather than
crashing at runtime.

## Media per host

| Host | `storage: 's3'` | `storage: 'local'` |
| --- | --- | --- |
| Long-running Node | full read/write | read live from the folder |
| Serverless / Workers | full read/write | read-only, from the build manifest |

`local` mode is read-only by design (the files belong to your repository). On serverless hosts the
`public/` folder is not on the function's filesystem, so the list comes from a manifest baked at
build time: a new image appears in the library after you commit and deploy that commit. This is
covered in detail in [Media → Serverless hosts](media.md#serverless-hosts).

For `s3` mode any S3-compatible bucket works, including Cloudflare R2:

```ts
media: {
   storage: 's3',
   endpoint: 'https://<account>.r2.cloudflarestorage.com',
   bucket: 'my-bucket',
   publicBaseUrl: 'https://cdn.example.com',
}
```

## Horizontal scaling

**Login rate limiting** is the one piece of state shared across requests. It uses Nitro's
`useStorage()` under the `cms:login-rate` key, so it inherits whatever driver you mount there.
Nitro's default is an in-memory driver, which means the limit is enforced **per instance**: with N
instances an attacker gets N times the attempts. Mount a shared driver to make it global:

```ts
// nuxt.config.ts
nitro: {
   storage: {
      'cms:login-rate': { driver: 'redis', url: process.env.REDIS_URL },
   },
}
```

On Cloudflare, `cloudflare-kv-binding` works the same way. Entries are written with a TTL, so
drivers that support expiry clean up after themselves.

**Postgres connections**: each instance opens its own pool. On a serverless host with hundreds of
concurrent cold instances that exhausts the server's connection limit. Cap the pool and put a pooler
(pgbouncer, Neon's pooled endpoint, RDS Proxy) in front:

```ts
cms: {
   database: { driver: 'postgres', url: '...', poolMax: 1 },
}
```

**SQLite** is single-writer by nature. The `sqlite` driver serialises write transactions inside the
process, which is correct for one instance and only for one instance. Do not run two replicas
against the same file; use `libsql`, `postgres` or `d1` instead.

**D1 has no transactions.** Writes that touch an entry and its many-to-many relations run as separate
statements, so a failure halfway through can leave the relations out of sync with the entry. This
affects the admin write path only; reads are unaffected. If you need atomic writes, pick another
driver.

## Cloudflare Workers

```ts
// nuxt.config.ts
cms: {
   database: { driver: 'd1', binding: 'DB' },   // binding defaults to 'DB'
   media: { storage: 's3', endpoint: 'https://<account>.r2.cloudflarestorage.com', /* ... */ },
}
```

```toml
# wrangler.toml
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "my-cms"
database_id = "..."
```

Build and deploy:

```bash
NITRO_PRESET=cloudflare_module nuxt build
npx wrangler deploy .output/server/index.mjs --assets .output/public
```

`nodejs_compat` is required: the module uses `node:crypto` for password comparison.

Drizzle Studio is not wired up for `d1`; use `wrangler d1 execute` or the Cloudflare dashboard.

## Checklist

- [ ] `NUXT_SESSION_PASSWORD` is set and at least 32 characters. The module refuses to boot in
      production without it.
- [ ] `NUXT_CMS_ADMIN_EMAIL` and `NUXT_CMS_ADMIN_PASSWORD` are set.
- [ ] `server/db/migrations/<driver>` is committed.
- [ ] The driver's client package is installed (`pg`, `@libsql/client`), unless you are on `sqlite`
      or `d1`.
- [ ] For more than one instance: not on the `sqlite` driver, and a shared storage driver is mounted
      for `cms:login-rate`.
- [ ] For Postgres on serverless: `poolMax` is set and a connection pooler is in front.
