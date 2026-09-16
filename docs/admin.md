# Admin panel & security

The admin panel is served by the same Nitro server, under `/cms`. It is a single-admin application:
one account, read from environment variables.

## Pages

| Path | Purpose |
| --- | --- |
| `/cms` | dashboard / entry-type index |
| `/cms/login` | admin login |
| `/cms/media` | media library |
| `/cms/:collection` | collection list, single editor, or page list |
| `/cms/:collection/new` | create entry |
| `/cms/:collection/:id` | edit entry, or edit one page |

A [`page` entry](schema.md#pages) gets its own section in the sidebar. The list is a tree that
follows the routes of the site: a child path sits under its parent, indented. On the right of each
row is the date and time of the last save, or `Never saved` when the page has no row yet, because a
page row is written the first time that page is saved. The stamp is rendered in the timezone of the
browser. The editor of a page shows the shared fields plus the
fields of that path, and its title carries a breadcrumb back to each ancestor page and to the list.
Pages cannot be deleted from the admin.

A `blocks` field is edited as a grid of tiles, not as a stack of forms. Each tile previews the
first media of the block (or its first text), and a click opens that block alone with its fields, a
duplicate and a remove action. The last cell of the grid adds a block. A block with a `boolean`
field named `hidden` set to true is dimmed in the grid.

A `media` field is a tile of the same shape, with the preview, the file name, replace and remove.
An empty one is a dashed box that opens the media library.

**Order.** Drag a tile onto another one to move it there. The target tile is outlined while you
drag. For a keyboard, focus the grip at the bottom left of a tile and press the left or right arrow
key; the block editor also carries two move buttons, which is the way on a touch screen.

All pages except `/cms/login` require an authenticated admin session (enforced by the `cms-auth`
route middleware). The admin UI ships in English and Italian.

## Authentication

- Credentials come from `NUXT_CMS_ADMIN_EMAIL` / `NUXT_CMS_ADMIN_PASSWORD` (or `cms.admin.*`).
- On a successful login at `/cms/login` a session cookie is set via
  [`nuxt-auth-utils`](https://github.com/atinux/nuxt-auth-utils).
- Email and password are compared with a timing-safe hash comparison.
- **Login rate limiting:** after 10 failed attempts from one IP within 15 minutes (or 100 failures
  globally in the same window) further attempts return `429` until the window resets. Counters live
  in Nitro's `useStorage()` under `cms:login-rate`, which defaults to an in-memory driver: with more
  than one instance the limit is enforced per instance unless you mount a shared driver. See
  [Deployment → Horizontal scaling](deployment.md#horizontal-scaling).

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
