# Admin panel & security

The admin panel is served by the same Nitro server, under `/cms`. It is a single-admin application:
one account, read from environment variables.

## Pages

| Path | Purpose |
| --- | --- |
| `/cms` | dashboard / entry-type index |
| `/cms/login` | admin login |
| `/cms/media` | media library |
| `/cms/:collection` | collection list |
| `/cms/:collection/new` | create entry |
| `/cms/:collection/:id` | edit entry |

All pages except `/cms/login` require an authenticated admin session (enforced by the `cms-auth`
route middleware). The admin UI ships in English and Italian.

## Authentication

- Credentials come from `NUXT_CMS_ADMIN_EMAIL` / `NUXT_CMS_ADMIN_PASSWORD` (or `cms.admin.*`).
- On a successful login at `/cms/login` a session cookie is set via
  [`nuxt-auth-utils`](https://github.com/atinux/nuxt-auth-utils).
- Email and password are compared with a timing-safe hash comparison.
- **Login rate limiting:** after 10 failed attempts from one IP within 15 minutes (or 100 failures
  globally in the same window) further attempts return `429` until the window resets.

## Sessions

Sessions are encrypted cookies. In **production** the module refuses to boot unless
`NUXT_SESSION_PASSWORD` is set to at least 32 characters — set a strong random value:

```bash
NUXT_SESSION_PASSWORD=$(openssl rand -base64 32)
```

The admin panel manages entries and media through its own authenticated, same-origin API. That API
is internal to the panel — your frontend reads content through the public
[GraphQL API](querying.md), never through the admin endpoints.

## Security summary

- Single admin account from env; timing-safe credential check.
- Encrypted session cookies; production requires `NUXT_SESSION_PASSWORD` (≥ 32 chars).
- Login rate limiting (per-IP and global).
- Admin mutations require a same-origin request.
- The public GraphQL API is read-only and never exposes draft entries.
