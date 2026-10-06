# Admin panel & security

The admin panel is served by the same Nitro server, under `/cms`. It is a single-admin application:
one account, read from environment variables.

## Pages

| Path | Purpose |
| --- | --- |
| `/cms` | dashboard / entry-type index |
| `/cms/login` | admin login |
| `/cms/media` | media library |
| `/cms/:collection` | collection list, content list, single editor, or page list |
| `/cms/:collection/new` | create entry or content item |
| `/cms/:collection/:id` | edit entry, content item, or one page |

A [`page` entry](schema.md#pages) gets its own section in the sidebar. The list is a tree that
follows the routes of the site: a child path sits under its parent, indented. On the right of each
row is the date and time of the last save, or `Never saved` when the page has no row yet, because a
page row is written the first time that page is saved. The stamp is rendered in the timezone of the
browser. The editor of a page shows the shared fields plus the
fields of that path, and its title carries a breadcrumb back to each ancestor page and to the list.
Pages cannot be deleted from the admin.

[Content entries](schema.md#content) get a **Content** group in the sidebar, between Singles and
Pages. Their list is the collection table, with title, status and publish date as default columns.
The status badge reads **Scheduled** when an item is published with a future `publishedAt`. New
and existing items open as a full page (`/cms/<entry>/new`, `/cms/<entry>/<id>`) with Save,
Publish or Make draft, and Delete. Publishing an item with an empty publish date sets it to now. The
publish date is picked in the browser's time zone and stored in UTC.

A `blocks` field is edited as a grid of tiles, not as a stack of forms. Each tile previews the
first media of the block (or its first text) and names it by that file, falling back to the label of
the block type. A click opens that block alone with its fields, a duplicate and a remove action. The last cell of the grid adds a block. The editor also has
**Hide** and **Show**: a hidden block is dimmed in the grid and left out of the public API. A
block that declares its own `boolean` field named `hidden` uses that field instead.

A `media` field is a tile of the same shape, with the preview, the file name, replace and remove.
An empty one is a dashed box that opens the media library.

**Order.** Drag a tile onto another one to move it there. The target tile is outlined while you
drag. For a keyboard, focus the grip at the bottom left of a tile and press the left or right arrow
key; the block editor also carries two move buttons, which is the way on a touch screen.

**Media lists.** A `blocks` field with one block type that has one `media` field (for example a
photo gallery) is edited as a media list. **+** opens the media library and adds the file you pick.
The X on a tile removes it, and a drag changes the order. No editor opens.

**Bulk actions.** Every row of a collection table has a checkbox. When rows are selected, the
toolbar shows **Delete** and, on a collection with `drafts`, **Publish** and **Draft**.

## Settings

The account button at the bottom of the sidebar opens **Settings**:

- **General**: the theme (light, dark or system). The choice is kept in the `cms-theme` cookie of
  the browser.
- **Account**: your name and your password. The super admin account comes from the environment
  variables, so it has no form here.
- **Users** (super admin only): add accounts, set a new password, delete accounts.
- **Content**: one item for each entry.
  - **Table columns** (collections only): show, hide and drag the columns of the table.
  - **Form layout**: drag a field up or down, or next to another field to put them in the same row.
    Sections come from the config and fields cannot be added.
- **Sign out**.

Column and layout changes save automatically in the `cms_settings` table and apply to every admin.
The [`layout` and `list` options](schema.md#form-layout) of the config are the default, and
**Reset to default** deletes the saved version. A saved layout follows config changes: a new field
goes at the end, and a removed field disappears.

All pages except `/cms/login` require an authenticated admin session (enforced by the `cms-auth`
route middleware).

## Authentication

- The credentials of `NUXT_CMS_ADMIN_EMAIL` / `NUXT_CMS_ADMIN_PASSWORD` (or `cms.admin.*`) sign
  in as the **super admin**. This account is not stored in the database and does not show in any
  list.
- The super admin creates more accounts in **Settings → Users**: an email, an optional name and a
  password (generate it and copy it with the buttons of the field). No email is sent. These
  accounts have the **admin** role: they can do everything in the panel, except manage users. They
  are stored in the `cms_users` table, with the password hashed by scrypt.
- On the first sign-in of a new account, a dialog offers to set a new password. The user can keep
  the shared one. Later, **Settings → Account** changes the name and the password. When the super
  admin sets a new password for a user, the next sign-in shows the dialog again.
- A deleted account loses access on its next request.
- On a successful login at `/cms/login` a session cookie is set via
  [`nuxt-auth-utils`](https://github.com/atinux/nuxt-auth-utils).
- Email and password are compared with a timing-safe hash comparison.
- **Login rate limiting:** after 5 failed attempts from one IP, or for one email, further attempts
  return `429` for 5 minutes. The lock always lasts 5 minutes and does not grow. Counters live
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
