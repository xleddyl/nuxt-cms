# Admin panel & security

The admin panel is served by the same Nitro server, under `/cms`. The super admin signs in with
the credentials from the environment variables. The super admin can add more admin accounts.

The brand shown in the sidebar, the mobile bar and the login page (logo, title, subtitle) is set
with `cms.admin.logo`, `cms.admin.title` and `cms.admin.subtitle`, see
[Configuration](configuration.md#admin-branding).

## Pages

| Path | Purpose |
| --- | --- |
| `/cms` | dashboard / entry-type index |
| `/cms/login` | admin login |
| `/cms/media` | media library |
| `/cms/:collection` | collection list, content list, single editor, or page list |
| `/cms/:collection/new` | create entry or content item |
| `/cms/:collection/:id` | edit entry, content item, or one page |
| `/cms/preview` | live preview inside the visual editor (path set by `cms.preview.path`) |

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
and existing items open in the [visual editor](#visual-editor) (`/cms/<entry>/new`,
`/cms/<entry>/<id>`). Publishing an item with an empty publish date sets it to now. The publish date
is picked in the browser's time zone and stored in UTC.

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

**Visual editor for a field.** When every block of a `blocks` field names a `component`, the field
also shows **Open visual editor**. It opens the [visual editor](#visual-editor) over the form, on
that field only, with the Block panel. **Done** goes back to the form; the changes are already in
the form and are saved with it.

**Bulk actions.** Every row of a collection table has a checkbox. When rows are selected, the
toolbar shows **Delete** and, on a collection with `drafts`, **Publish** and **Draft**.

## Search

The search box under the title of the sidebar, or ⌘K (Ctrl K on Windows and Linux), opens a search
dialog. Results appear while you type, from 2 characters on, grouped by entry:

- **Labels** from the config: entries, pages (label or path), tabs, fields, blocks and block
  fields. A hit opens that entry or page; on a single or on a field of one page it opens the editor
  on that field.
- **Values** stored in every entry: collections, singles, content items and pages (page field rows
  and blocks included), in every language of a translatable field, with a language badge. Text,
  rich text (matched without its markup), slugs, emails, selects, JSON and the fields of blocks are
  searched, private fields too, plus the alt texts of the media library. Each hit shows the item,
  the field and a snippet with the match highlighted.

Up and down move through the results, Enter opens one, Escape or a click outside closes the dialog.
A hit opens the editor with `?field=`, `locale=` and `block=` in the URL: the editor switches to the
tab and the language of the field, selects the block in the visual editor, scrolls to the field and
highlights it.

The dialog reads `GET /api/cms/search?q=`, which needs an admin session like every admin endpoint.
Matching is a case-insensitive `LIKE` (`%` and `_` in the query are matched literally), with at
most 10 rows per entry and 50 value hits; type more words to narrow the results. On SQLite, libSQL
and D1 the case folding only covers ASCII letters, and a phrase that spans formatting in rich text
(for example a bold word in the middle) is not found as a whole.

## Visual editor

The visual editor edits a body of blocks on top of the real site. It fills the window:

- **Top bar**: back, the title, the status badge (Draft, Published or Scheduled) and an "Unsaved
  changes" note, the language switch, the preview width (desktop or mobile, 390 px), and the
  actions: **Schedule**, **Save**, **Publish** or **Unpublish**, and Delete in the `...` menu.
  **Schedule** picks a publish date and publishes the item: with a future date it stays hidden from
  the site until then. Save stays in the editor; the first save of a new item moves to its URL.
- **Canvas** (center): the [preview page](#preview-page) of the site in an iframe, so the site
  layout and CSS apply. Every change is shown at once, before saving.
- **Inspector** (right), with three tabs. **Content**: title, slug, publish date, excerpt, cover and
  the extra fields, in the order of the form layout. **Block**: the fields of the selected block,
  or, when no block is selected, the list of blocks and the palette to add one. **SEO**: the SEO
  fields. The language switch of the top bar drives every translatable field.

In the canvas, hover a block to outline it with its label; click it to select it and open its
fields. The toolbar of a block has a drag handle, move up and down, **Duplicate**, **Hide** and
delete. A **+** between two blocks, and before the first and after the last, opens the palette
(label, icon and description of each block type) and inserts the block there. A hidden block is not
drawn in the canvas: it stays in the block list with an eye icon, where **Show** brings it back.

**Keyboard.** Every action is a button. In the canvas, focus the drag handle and press the up or
down arrow to move the block; Escape clears the selection. In the block list, Alt with the up or
down arrow moves the focused block. The block panel also has move up and move down buttons.

**Validation.** Save and Publish check the whole item first. The first error opens its tab, selects
the block that holds it and switches to the default language when the field is translatable; a dot
marks every tab with an error. Leaving with unsaved changes asks for a confirmation.

### Preview page

The canvas loads `/cms/preview` (see [`preview.path`](configuration.md#preview)), a page that the
module adds to the site. It uses the default layout of the site, so it looks like a real page. It
needs an admin session, answers with `X-Robots-Tag: noindex, nofollow` and a robots meta tag,
`X-Frame-Options: SAMEORIGIN`, and lives under `/cms`, so keep `/cms/**` out of your sitemap. The page
reads nothing from the public API: the admin sends the unsaved item with `postMessage`, and both
sides check the origin and the sender window of every message. A reload of the iframe, or a hot
reload in development, asks the admin for the data again.

The preview resolves translations like the GraphQL API does, and the admin sends the media objects
(`url`, `alt`, `type`, `width`, `height`) of the media library, so a block component receives the
same props as on the site. Relations are passed as ids. Each block root gets `data-cms-block`
attributes, which the editor uses to draw its outlines, so a block component needs a single root
element. Clicks on links and form submits inside the canvas do nothing.

A content entry can show its body inside a component of the site, for example the article header,
with [`preview.component`](schema.md#preview-component). Without one, the canvas shows the blocks
only.

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
- The count of failed attempts also resets 5 minutes after the first failure. A successful login
  clears the counters.

## Sessions

Sessions are encrypted cookies. In **production** the module refuses to boot unless
`NUXT_SESSION_PASSWORD` is set to at least 32 characters. Set a strong random value:

```bash
NUXT_SESSION_PASSWORD=$(openssl rand -base64 32)
```

The admin panel manages entries and media through its own authenticated, same-origin API. That API
is internal to the panel: your frontend reads content through the public
[GraphQL API](querying.md), never through the admin endpoints.

## Security summary

- A super admin from env, plus admin accounts in `cms_users` (scrypt hashes). The credential check
  is timing-safe.
- Encrypted session cookies; production requires `NUXT_SESSION_PASSWORD` (≥ 32 chars).
- Login rate limiting: per IP and per email, 5 failures lock the login for 5 minutes.
- Admin mutations require a same-origin request.
- The public GraphQL API is read-only and never exposes draft entries. Introspection works only
  in development.
