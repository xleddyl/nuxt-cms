# Skipped for now (2026-07-05)

Features deliberately postponed while aligning with Strapi. Revisit when the core is stable.

- **Multi-user + RBAC** — users table, roles, per-collection permissions. Today: single admin from env.
- **API tokens** — scoped tokens for the public API / protected endpoints. Today: public API fully anonymous, writes blocked.
- **True draft/publish** — dual draft+published versions of the same entry, scheduled publishing. Today: single `status` column, edits to published rows go live immediately.
- **Webhooks + lifecycle hooks** — events on create/update/delete/publish (e.g. static site rebuild triggers).
- **Revision history / audit log** — only `createdAt`/`updatedAt` today.
- **Content-type builder UI** — probably a non-goal: code-first `cms.config.ts` is the differentiator.
- **Plugin system**
- **Admin dashboard**
- **Public REST API** — removed 2026-07-05 in favour of GraphQL as the only public query surface. If reintroduced, consider PostgREST compatibility so postgrest-js can be the frontend driver (studied: filters/order/limit matched; missing `select=` embeds, bare-array responses, `Prefer: count=exact`/`Content-Range`, `.single()` Accept header, PostgREST error shape).
- **GraphQL filters on localized (JSON) fields**
- **GraphQL or/and filter combinators** — filters are ANDed today (across fields and operators).
- **GraphQL one-to-many inverse fields** — e.g. `Categories.events`; declare the relation on the many side and query from there meanwhile.
- **Media library pagination** — the gallery loads all cms_media rows at once; fine at mini-CMS scale, paginate if libraries grow.
- **GraphQL e2e tests** — @nuxt/test-utils against in-memory sqlite. Unit suite (validateConfig, schema codegen both dialects, zod validators, SDL, upload mime) added 2026-07-06 with `pnpm test` wired into CI and release.
- **Draft preview** — signed preview token (or admin session) that lets GraphQL return drafts, so editors can see unpublished content on the site.
- **Seed / import-export** — JSON export/import per collection for reproducible dev data, backups, and sqlite↔postgres moves.
- **Localized fields and blocks localization inside blocks** — block fields are non-localizable in v1.
