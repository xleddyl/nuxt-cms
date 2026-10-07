# Schema

Content types are declared in `cms.config.ts` at the project root with `defineCmsConfig()`. From
this single file the module generates the database schema, migrations, TypeScript types and the
read-only GraphQL API. The config is validated at build time; invalid config fails the build with
precise errors.

```ts
import { defineCmsConfig } from '#nuxt-cms'

export default defineCmsConfig({
   <entryKey>: {
      id: '<entryKey>',            // must equal the object key
      label: 'Human label',
      kind: 'collection' | 'single' | 'content',
      titleField: 'name',          // collections: required, field used as the entry title
      drafts: true,                // optional; adds draft/published status
      fields: { <fieldKey>: <FieldInput>, ... },
   },
})
```

## Entries

- **`collection`**: many rows, with list + detail + count queries.
- **`single`**: one document, with a single query.
- **`page`**: one row per route of the app, with a list query and a query by path. See
  [Pages](#pages).
- **`content`**: one entry per content type (news, blog, ...). Each item has system fields (title,
  slug, excerpt, cover, publish date, SEO) and a body made of blocks, with drafts and scheduled
  publishing. See [Content](#content).
- `id` (equal to the object key), `label`, `kind` and `fields` are required.
- `titleField` is **required on collections** and not allowed on singles. It picks the field used as
  the entry title: in the admin list, in relation pickers, and to render relation columns (a
  relation cell shows the target's title instead of its id). It must be a `text`, `slug`, `email`,
  `number`, `date` or single `select` field, and it is the field the admin search matches on.
- `drafts: true` (collections only) adds a draft/published status. **The public GraphQL API returns
  published rows only**: drafts are invisible to it.
- `id`, `createdAt` (collections only) and `updatedAt` are managed automatically: never declare
  them as fields. Row ids are opaque strings.

The GraphQL type name is the PascalCase of the entry key (`blog_posts` → `BlogPosts`).

## Pages

A `page` entry holds the content of the pages of the app: one row per route, with one section in
the admin. Use it for the images and the texts that belong to a page, instead of one
`single` per page.

```ts
pages: {
   id: 'pages',
   label: 'Pages',
   kind: 'page',
   exclude: ['/cms'],
   labels: { '/': 'Home' },
   order: ['/', '/about'],
   fields: {
      title: { label: 'Title', type: 'text', translatable: true },
      cover: { label: 'Cover', type: 'media', mediaType: ['image', 'video'] },
   },
   overrides: {
      '/about': { intro: { label: 'Intro', type: 'text', textarea: true } },
   },
}
```

**Where the rows come from.** By default (`routes: 'auto'`) the module reads the page files of the
app and makes one row per route. Dynamic routes (`[slug].vue`, `[...all].vue`) are skipped, and
route groups (`(marketing)/`) do not appear in the path. `routes: ['/a', '/b']` replaces the
discovered list with an explicit one. `include` adds paths that are not page files, `exclude`
removes paths, `order` puts the given paths first in the admin, and `labels` overrides the label
that is otherwise built from the last segment of the path.

**Fields.** `fields` applies to every page. `overrides` changes the fields of one path: it adds
fields, and `null` removes a shared field from that path alone.

```ts
overrides: {
   '/': { gallery: null, slideshow: { label: 'Slideshow', type: 'blocks', blocks: { ... } } },
}
```

An override may not redeclare a shared field, and two paths that declare the same field name must
declare the same type. A removed field keeps its stored values, so the other pages are untouched.
The admin form of a path shows exactly the fields of that path.

**Identity.** `path` is a reserved field name and is unique. Each row has an `id` built from the
path (`/asolo-e-dintorni/venezia` gives `asoloEDintorniVenezia`, `/` gives `home`), which is the
address of the page in the admin.

**Scripts.** A script that reads `cms.config.ts` on its own (a seed, an import) gets no routes,
because the module resolves them at build time. `resolveCmsPages` fills them in:

```ts
import { resolveCmsPages } from '@xleddyl/nuxt-cms/seed'

const config = resolveCmsPages(await jiti.import('./cms.config.ts', { default: true }))
config.pages.pages // [{ path: '/about', key: 'about', label: 'About' }, ...]
```

**Limits.** One page entry per config. `titleField` and `drafts` do not apply. Rows are created
when a page is saved for the first time, and they cannot be deleted from the admin.

### Storage

A page entry keeps one row per page and stores the field values as rows of two child tables, so
pages with many page-specific fields do not produce a wide table that is mostly `NULL`.
`columns` lists the fields that stay columns of the page table (none by default):

```ts
pages: {
   id: 'pages',
   label: 'Pages',
   kind: 'page',
   columns: ['metaTitle', 'metaDescription', 'ogImage'],
   fields: { ... },
   overrides: { ... },
}
```

For an entry called `pages` the schema is:

```
pages         (id, path unique, <fields listed in columns>, updated_at)
pages_fields  (page_id -> pages.id on delete cascade, key, position default 0, value)
              primary key (page_id, key, position)
pages_media   (page_id -> pages.id on delete cascade, key, position default 0, media_key)
              primary key (page_id, key, position)
```

- `columns` lists the fields that stay columns of the page table. Each one must be declared in
  `fields` (for every page) and must not be removed by an override. Without `columns` the page
  table holds only `id`, `path` and `updated_at`.
- A scalar field is one row in `<entry>_fields` at `position` 0. Plain strings (`text`,
  `richtext`, `email`, `date`, single `select`) are stored as they are; every other value
  (numbers, booleans, multi-select, `json`, translatable text) is stored as JSON text, so a
  translatable field keeps the same `{"en": "...", "it": "..."}` it has in a column.
- A media field is one row in `<entry>_media` at `position` 0; `media_key` holds the same value a
  column would (the key, or the JSON of a translatable media).
- A `blocks` field stores each block at its own `position`: the block type is a row with
  `key = <field>._type`, each subfield is a row with `key = <field>.<subfield>` (media subfields
  in `<entry>_media`, the others in `<entry>_fields`).
- An empty value (`null`) has no row. An empty list of blocks reads back as `null`.
- `relation` and `slug` fields must be listed in `columns` (they need their foreign key and their
  unique index), and many-to-many relations are not supported on pages.

The storage does not show outside the database: the GraphQL schema, the generated types and
queries, the admin API and the panel see one flat object per page, with every field. Reading a page (or all pages) is one
query on every driver, with two correlated subqueries (`json_group_array` on SQLite, libSQL and
D1, `json_agg` on Postgres). Saving a page is one transaction on SQLite and Postgres and one batch
(a single round trip) on libSQL and D1.

**No foreign key to `cms_media`.** `media_key` is not a foreign key to `cms_media.key`. With
`storage: 'local'` the files come from the folder (or the build manifest) and `cms_media` only holds
the alt texts, so it can be empty while pages use many media; with `'s3'` deleting a file from the
library removes its `cms_media` row, and a foreign key would either block that or wipe content. The
module checks media keys when a page is saved instead: the admin API rejects (400) a media key, in
a media field or in a block, that is not in the media library (the folder or manifest in local
mode, `cms_media` in `'s3'` mode), and the panel flags a saved media that is no longer there.

**Upgrading from 0.1.56 or earlier (breaking).** Earlier versions stored every page field as a
column of the page table. After the upgrade, `drizzle-kit generate` (run by the dev server) writes
one migration that creates `<entry>_fields` and `<entry>_media` and then drops every page column
that is not listed in `columns`. The data is not copied for you: before deploying, edit that
migration and put the copy between the `CREATE TABLE` statements and the first `DROP COLUMN`,
each statement followed by `--> statement-breakpoint`. For example on SQLite, libSQL and D1:

```sql
INSERT INTO pages_fields (page_id, key, position, value)
SELECT id, 'title', 0, title FROM pages WHERE title IS NOT NULL;
--> statement-breakpoint
INSERT INTO pages_media (page_id, key, position, media_key)
SELECT id, 'cover', 0, cover FROM pages WHERE cover IS NOT NULL;
--> statement-breakpoint
INSERT INTO pages_fields (page_id, key, position, value)
SELECT pages.id, 'gallery._type', block.key, json_extract(block.value, '$.type')
FROM pages, json_each(pages.gallery) AS block WHERE pages.gallery IS NOT NULL;
```

Write one statement per moved field. Column values copy as they are: plain strings, the JSON text of
a translatable field and media keys are already in the stored format; a boolean column becomes
`'true'` or `'false'` and a number its text. For a `blocks` field write one statement per subfield
as well, reading it with `json_extract(block.value, '$.<subfield>')` and skipping `NULL`s
(`json_type(block.value, '$.<subfield>')` tells `'null'`, `'true'` and `'false'` apart, and a
translatable subfield comes out as its JSON text); media subfields go to `<entry>_media`. On
Postgres use `jsonb_array_elements ... WITH ORDINALITY` (position is the ordinality minus one). Compare
the GraphQL output of every page before and after the migration.

## Content

A `content` entry is a content type such as news or a blog: each item has a fixed set of system
fields plus a body made of [blocks](#blocks). Declare one entry per content type, so two types can
use different blocks and different extra fields.

```ts
import { defineCmsBlocks, defineCmsConfig } from '#nuxt-cms'

const sections = defineCmsBlocks({
   text: {
      label: 'Text',
      component: 'SectionText',
      icon: 'bars-3-bottom-left',
      description: 'A heading and a paragraph.',
      fields: {
         heading: { label: 'Heading', type: 'text', translatable: true },
         body: { label: 'Body', type: 'richtext', translatable: true, required: true },
      },
   },
   image: {
      label: 'Image',
      component: 'SectionImage',
      fields: { image: { label: 'Image', type: 'media', mediaType: 'image', required: true } },
   },
})

export default defineCmsConfig({
   news: {
      id: 'news',
      label: 'News',
      kind: 'content',
      icon: 'newspaper',
      blocks: sections,
      fields: {
         category: { label: 'Category', type: 'relation', to: 'categories' },
      },
      labels: { excerpt: 'Summary' },
   },
})
```

- `blocks` (required) is the set of blocks of the body. `defineCmsBlocks()` returns it unchanged
  with its literal types, so several entries can share one set.
- `fields` (optional) adds extra fields to every item, with the same options as a collection.
- `labels` (optional) renames system fields in the admin, keyed by system field name.
- `tabs`, `layout` and `list` work as on a collection. The default list columns are title, status
  and publish date. In the visual editor, `layout` orders the fields of the Content tab.
- `preview` (optional) sets the component that wraps the body in the visual editor, see
  [Preview component](#preview-component).
- `titleField`, `drafts`, `columns`, `routes`, `include`, `exclude`, `overrides` and a custom
  `table` are config errors on a content entry.

System fields, injected for you (declaring one of them in `fields` is a config error):

| field            | type                                 | notes                                              |
| ---------------- | ------------------------------------ | -------------------------------------------------- |
| `title`          | `text`, translatable, required       | the title of the item                              |
| `slug`           | `slug`, unique, required             | generated from the title in the default locale     |
| `publishedAt`    | `datetime`                           | ISO 8601 UTC; set to now when published empty      |
| `excerpt`        | `text` textarea, translatable        |                                                    |
| `cover`          | `media` image                        |                                                    |
| `body`           | `blocks` built from `blocks`         |                                                    |
| `seoTitle`       | `text`, translatable                 |                                                    |
| `seoDescription` | `text` textarea, translatable        |                                                    |
| `seoImage`       | `media` image                        |                                                    |

The text system fields are translatable when `cms.i18n.locales` is set, plain text otherwise.

Every item has a draft or published `status` and `createdAt`/`updatedAt`. **The public API returns
an item only when it is published and its `publishedAt` is not in the future**: a published item
with a future date is scheduled, and it shows up on its own once that moment has passed. The rule
applies to the list, the count, the queries by id and by slug, and to every relation that points
at a content entry. Content entries can be the target of a relation (`to: 'news'`).

Content items are stored in a regular table named after the entry, so they follow the same
migrations as collections.

Items are edited in the [visual editor](admin.md#visual-editor): the body is drawn by the block
components of the site, with live updates, drag and drop and a palette of the blocks.

### Preview component

By default the visual editor shows only the blocks of the body. To show the whole article as the
site does, name a site component that takes the item and renders the body in its default slot:

```ts
news: {
   id: 'news',
   kind: 'content',
   blocks: sections,
   preview: { component: 'NewsArticle' },
   ...
}
```

```vue
<template>
   <article>
      <h1>{{ item.title }}</h1>
      <p v-if="item.excerpt">{{ item.excerpt }}</p>
      <slot />
   </article>
</template>

<script setup lang="ts">
import type { News } from '#cms-types'

defineProps<{ item: Pick<News, 'title' | 'excerpt' | 'cover'>; locale?: string }>()
</script>
```

The component receives `item` (every public field of the item in the active language, media as
`CmsMedia` objects, relations as ids, values not saved yet included) and `locale`. Use the same
component on the site page, with `<CmsBlocks>` in the slot, and the preview matches the page.
`cms.preview.component` in `nuxt.config` sets a default for every content entry. A `preview` option
on an entry that is not `kind: 'content'` is a config error.

## Field types

Every field has `label: string` and optional `required?: boolean` and `private?: boolean` (see
[Private fields](#private-fields)). Type-specific options:

| type       | extra options                                                                      | stored / queried as |
| ---------- | ---------------------------------------------------------------------------------- | ------------------- |
| `text`     | `textarea?: boolean`, `translatable?: boolean`                                      | String              |
| `richtext` | `translatable?: boolean`                                                            | String (HTML)       |
| `number`   | `integer?: boolean`                                                                 | Float / Int         |
| `boolean`  | none                                                                               | Boolean             |
| `date`     | none                                                                               | String `yyyy-mm-dd` |
| `datetime` | none                                                                                | String, ISO 8601 UTC |
| `email`    | none                                                                               | String              |
| `slug`     | `from: '<fieldKey>'` (required; auto-generated from that text field)                | String (unique)     |
| `select`   | `options: string[]` (required, unique), `multiple?: boolean`                        | String (enum) or `[String!]!` |
| `json`     | none                                                                               | JSON                |
| `media`    | `mediaType?: T \| T[]` where `T` is `'image' \| 'video' \| 'file'`, `accept?: string[]`, `translatable?: boolean`, `mobile?: boolean` | CmsMedia object     |
| `relation` | see [Relations](#relations)                                                         | related entry / list |
| `blocks`   | `blocks: Record<name, { label, fields }>` (required)                                | array of typed blocks |

A `datetime` field stores an instant as an ISO 8601 string in UTC (`2026-05-01T08:30:00.000Z`). The
API accepts any ISO 8601 date and time with a time zone (`Z` or `+02:00`) and stores it in UTC; a
value without a time zone is rejected. The admin shows a date and time picker in the browser's time
zone. It filters and sorts as a `StringFilter`, and the fixed format keeps the string order equal to
the time order.

## Multi-select fields

`select` fields support a `multiple: true` option to allow selecting multiple options:

```ts
tags: {
   label: 'Tags',
   type: 'select',
   options: ['featured', 'news', 'tutorial', 'guide'],
   multiple: true,
   required: true,  // when true, at least one option must be selected
}
```

Multi-select fields are stored as JSON arrays and queried as `[String!]!` in GraphQL. They are **excluded from filtering and sorting** and **not allowed inside blocks**.

When `required: true`, the field must have at least one item (an empty array is invalid).

## Relations

```ts
category: {
   label: 'Category',
   type: 'relation',
   to: 'categories',              // required: target entry key (must be a collection)
   cardinality: 'many-to-one',    // 'many-to-one' (default) | 'one-to-one' | 'many-to-many'
   onDelete: 'set null',          // 'set null' | 'cascade' | 'restrict'
}
```

- The target `to` must be a **collection** or a [**content**](#content) entry.
- `many-to-one` / `one-to-one` store a foreign key on the entry; `many-to-many` uses a generated
  join table (`<entry>_<field>`).
- A `required` relation cannot use `onDelete: 'set null'`.
- Custom-table entries cannot be the source of `many-to-many` relations.

## Blocks

A `blocks` field is an ordered list of typed content blocks, for page builders.

```ts
body: {
   label: 'Body',
   type: 'blocks',
   blocks: {
      hero: { label: 'Hero', fields: {
         heading: { label: 'Heading', type: 'text', required: true },
         image: { label: 'Image', type: 'media', mediaType: 'image' },
      } },
      quote: { label: 'Quote', fields: {
         text: { label: 'Text', type: 'text', textarea: true },
      } },
   },
}
```

Block fields accept every field type **except** `slug`, `relation`, `blocks`, and multi-select
(`select` with `multiple: true`). They can be `translatable` (see below) but not `private`: mark the
whole `blocks` field private instead.
`required` inside a block is an admin and save-time rule: the API and the generated types always
return block fields as nullable, since stored items can predate a field or its `required` flag.
See [Querying → Blocks](querying.md#blocks) for how to read them.

Every block item can carry `hidden: true`, set from the block editor with **Hide**. When the block
does not declare a field named `hidden`, hidden items are dropped from the public API. A block that
declares its own `hidden` field keeps the old behavior: the value is returned and the site decides.

### Block components

A block can name the site component that renders it, plus an icon and a help text for the admin:

```ts
blocks: {
   hero: {
      label: 'Hero',
      component: 'SectionHero',
      icon: 'photo',
      description: 'Full-width image with a heading.',
      fields: { ... },
   },
}
```

- `component` is the name of a component of the site as Nuxt auto-imports it (`SectionHero`, or
  `section-hero`). The build fails when no such component is registered.
- `icon` is a Heroicons outline name; `description` is a short help text.
- These keys work in every `blocks` field: collections, singles, pages and content.
- A block with a `component` cannot have fields named `key`, `ref`, `class` or `style`.
- When every block of a field has a `component`, the admin edits that field in the
  [visual editor](admin.md#visual-editor) as well; other `blocks` fields keep the tile grid.

Render a blocks value with [`<CmsBlocks>`](querying.md#rendering-blocks). Each component receives
the fields of its block as props. Type them with the generated interface
`<Entry><Field><Block>Props` from `#cms-types`:

```vue
<script setup lang="ts">
import type { NewsBodyHeroProps } from '#cms-types'

defineProps<NewsBodyHeroProps>()
</script>
```

The same type is reachable as `CmsBlockProps<'news', 'body', 'hero'>`, for use outside
`defineProps` (Vue cannot resolve a generic indexed type in `defineProps`, so use the named
interface there).

### Translatable block fields

`text`, `richtext` and `media` fields **inside** a block accept `translatable: true`, with the same
semantics as at the top level:

```ts
answers: {
   label: 'Answers', type: 'blocks',
   blocks: {
      answer: { label: 'Answer', fields: {
         text: { label: 'Text', type: 'text', required: true, translatable: true },
         correct: { label: 'Correct', type: 'boolean' },
      } },
   },
}
```

The per-locale values live inside the block's JSON, so the column shape does not change and **adding
`translatable: true` to an existing block field needs no migration**: blocks that still hold a plain
value keep working and are read as the default locale's value. The query shape does not change
either: the field still resolves to a single `String` (or `CmsMedia`) for the requested `locale`.

In the admin panel the locale switcher appears next to the `blocks` field label and applies to every
translatable sub-field of every block at once, so a whole list can be translated in one pass.

## Tabs

An entry with many fields can split its admin form into horizontal tabs. Declare `tabs` on the
entry, then send each field to one with `tab`.

```ts
pages: {
   id: 'pages',
   label: 'Pages',
   kind: 'page',
   tabs: [
      { id: 'texts', label: 'Texts' },
      { id: 'images', label: 'Images' },
      { id: 'seo', label: 'SEO' },
   ],
   fields: {
      title: { label: 'Title', type: 'text' },
      hero: { label: 'Hero', type: 'media', tab: 'images' },
      metaTitle: { label: 'Meta title', type: 'text', tab: 'seo' },
   },
}
```

- **Only the admin editor is affected.** The database, the GraphQL schema and the query shape are
  unchanged.
- A field with no `tab`, like `title` above, goes to the **first** tab.
- An entry with no `tabs`, or with one tab, renders as a single form with no tab strip.
- A field that points at a tab the entry does not declare fails the build, and so does a duplicate
  tab id or a tab with no label.
- On a page entry, a field added by `overrides` takes `tab` the same way.
- `tab` is not supported inside `blocks`: a block's own fields always render together.
- When a save fails validation, the form opens the tab that holds the first invalid field, so the
  error is never hidden behind another tab.

## Form layout

By default the admin form shows one field per row, in the order of `fields`. Use `layout` on an
entry to change that. It is admin-only: the database, the GraphQL schema and the query shape do not
change.

```ts
events: {
   id: 'events',
   label: 'Events',
   kind: 'collection',
   titleField: 'title',
   icon: 'calendar-days',
   fields: { /* ... */ },
   layout: [
      ['title', 'slug'],
      'description',
      ['seats', 'price', 'date'],
      ['category', 'featured'],
      {
         title: 'Advanced',
         description: 'Data for integrations.',
         collapsed: true,
         rows: ['metadata', 'internalNotes'],
      },
   ],
   list: { columns: ['title', 'date', 'category', 'status'] },
}
```

- A string is a row with one field. An array is a row with up to 4 fields side by side. On a narrow
  screen the fields of a row stack.
- An object with `title` and `rows` is a section: a titled card. `description` shows under the
  title, and `collapsed: true` closes it by default.
- Fields that the layout does not name go at the end of the form, each in its own row. The mobile
  field of a `mobile: true` media field goes next to its parent, or on the next row when the row is
  full.
- Tabs still apply: the form shows the fields of the active tab.
- A key that is not a field, a key named twice, a row with more than 4 fields or a section with no
  title fails the build. On a page entry, the layout can name fields from `overrides`.

Other admin-only options:

| Option | On | Effect |
| --- | --- | --- |
| `icon` | entry | The icon in the sidebar and the page header. A Heroicons outline name, for example `calendar-days`. |
| `list.columns` | collection | The default table columns, in order. `status` is available on collections with `drafts`. Without it, the table shows the first 4 fields. |
| `description` | field | A help text under the input. |
| `placeholder` | field | The placeholder of text, textarea, email, number and select inputs. |

Admins can change the table columns and the form layout in **Settings** (see
[Admin panel](admin.md#settings)). The config is the default, and **Reset to default** goes back
to it.

## Conditional fields

`showIf` hides a field in the admin editor until another field of the same entry has a given value. This is
useful when one `select` decides which of the remaining fields are meaningful.

```ts
type: { label: 'Type', type: 'select', options: ['text', 'image'], required: true },
body:  { label: 'Body',  type: 'richtext', showIf: { field: 'type', eq: 'text' } },
photo: { label: 'Photo', type: 'media', showIf: { field: 'type', eq: 'image' } },
```

- Use `eq` for a single value or `in` for a list; pass an **array of conditions** to require all of
  them (AND).
- **Only the admin editor is affected.** The GraphQL schema, the database column and the query shape
  are unchanged: a condition cannot make a column conditional.
- A hidden field **keeps the value it already has**; it is not cleared on save, so toggling the
  controlling field back and forth does not lose work.
- On a conditional field, `required` means **"required while visible"**: it is enforced by the admin
  form only. The column stays nullable and the GraphQL field stays optional, because two fields
  belonging to opposite branches can never both be filled, and a `NOT NULL` on either would make every
  entry unsavable. Treat a conditional field as optional when you read it.
- The condition may point at a `select`, `boolean`, `text`, `number`, `date`, `email` or `slug`
  field. It cannot point at `blocks`, `relation`, `media`, `json`, multi-select or translatable fields, whose
  values have no single comparable form.
- When the target is a `select`, the referenced values are checked against its `options` at build
  time, so a typo fails the build instead of silently hiding the field forever.
- The `titleField` cannot be conditional, and `showIf` is not supported inside `blocks`.

## Private fields

`private: true` keeps a field out of the **public GraphQL API**. The column is still created, the
field is still editable in the admin panel and its value is still stored. It is simply never
published: it is absent from the entry type, from the filters input and from the sort enum, so it
cannot be selected, filtered or sorted on, and introspection does not reveal it. It is also omitted
from the generated `#cms-types` interfaces, which describe the API shape.

```ts
file: { label: 'File', type: 'media', mediaType: 'file', private: true }
```

Use it for values that only server-side code should see, for example a media key that must be served
through your own authenticated route instead of the public bucket URL. Read those values from the
database directly (`#cms-db` + `#cms-tables`) in a server handler that enforces your own rules:

```ts
import { useDb } from '#cms-db'
import { magazine } from '#cms-tables'
import { eq } from 'drizzle-orm'

const [row] = await useDb().select().from(magazine).where(eq(magazine.id, id)).limit(1)
```

Note that a private field holds its **raw column value** (a media field holds the object key string,
a translatable media field a JSON map of locale → key), not the resolved GraphQL shape.

`private` is not supported inside `blocks`: mark the whole `blocks` field private instead.

## Translatable fields

`translatable: true` is supported on `text`, `richtext` and `media`, as top-level fields and
[inside blocks](#translatable-block-fields). It requires `cms.i18n.locales` to be configured. Values are stored per locale and resolved to a single value at query time via the
`locale` argument (falling back to `defaultLocale` when a translation is missing). Translatable
fields are **excluded from filtering and sorting**.

```ts
i18n: { locales: ['en', 'it'], defaultLocale: 'en' } // in nuxt.config.ts

description: { label: 'Description', type: 'richtext', translatable: true } // in cms.config.ts
```

### Translatable media

A translatable `media` field holds a different file per locale: an Italian and a German PDF of the
same document, a screenshot per language, and so on. The admin panel shows the usual media picker
with the locale switcher above it, one file per locale.

```ts
brochure: { label: 'Brochure', type: 'media', mediaType: 'file', translatable: true }
```

The query shape does not change; it still resolves to a single `CmsMedia`:

```graphql
brochure { url alt }
```

Resolution picks the requested `locale`, then `defaultLocale`, then any locale that has a file.
The column stays a plain `text` column holding a JSON map of locale → object key, so adding
`translatable: true` to an **existing** media field needs no migration: rows that still hold a plain
key keep working and are read as the default locale's value.

### Mobile media

`mobile: true` on a top-level `media` field adds a second, optional media field for small screens.
The CMS names it `<field>Mobile` and puts it right after the main field in the admin, with the label
`<label> (mobile)` and the same `mediaType`, `accept`, `tab` and `translatable` options.

```ts
hero: { label: 'Hero', type: 'media', mediaType: ['image', 'video'], mobile: true }
```

```graphql
hero { url type }
heroMobile { url type }
```

The module only stores and serves the two files. The frontend decides the breakpoint and falls back
to the main media when `heroMobile` is empty. The mobile field is a normal media field, so it is a
new column on collections and singles (generate a migration) and a new row key on pages. A declared
field with the same `<field>Mobile` key is a config error, and `mobile` is not supported inside
`blocks`.

## Full example

```ts
import { defineCmsConfig } from '#nuxt-cms'

export default defineCmsConfig({
   categories: {
      id: 'categories', label: 'Categories', kind: 'collection', titleField: 'name',
      fields: { name: { label: 'Name', type: 'text', required: true } },
   },
   tags: {
      id: 'tags', label: 'Tags', kind: 'collection', titleField: 'name',
      fields: { name: { label: 'Name', type: 'text', required: true } },
   },
   events: {
      id: 'events', label: 'Events', kind: 'collection', titleField: 'title', drafts: true,
      fields: {
         title: { label: 'Title', type: 'text', required: true },
         slug: { label: 'Slug', type: 'slug', from: 'title', required: true },
         description: { label: 'Description', type: 'richtext', translatable: true },
         seats: { label: 'Seats', type: 'number', integer: true },
         date: { label: 'Date', type: 'date', required: true },
         visibility: { label: 'Visibility', type: 'select', options: ['public', 'hidden'] },
         topics: { label: 'Topics', type: 'select', options: ['tech', 'science', 'art'], multiple: true },
         poster: { label: 'Poster', type: 'media', mediaType: ['image', 'video'] },
         category: { label: 'Category', type: 'relation', to: 'categories' },
         tags: { label: 'Tags', type: 'relation', to: 'tags', cardinality: 'many-to-many' },
         body: {
            label: 'Body', type: 'blocks',
            blocks: {
               hero: { label: 'Hero', fields: {
                  heading: { label: 'Heading', type: 'text', required: true },
                  image: { label: 'Image', type: 'media', mediaType: 'image' },
               } },
            },
         },
      },
   },
   homepage: {
      id: 'homepage', label: 'Homepage', kind: 'single',
      fields: { heroTitle: { label: 'Hero title', type: 'text', required: true, translatable: true } },
   },
})
```

## Validation rules (highlights)

- Entry keys and field keys must be valid identifiers. The reserved entry names are `admin`,
  `auth`, `login`, `media`, `graphql`, `settings`, `cms_media`, `cms_settings` and `cms_users`. The
  automatic columns (`id`, `status`, `created_at`, `updated_at`) are reserved field names.
- `drafts` is only valid on collections; content entries always have drafts and do not take the
  option.
- A content entry needs a non-empty `blocks` map and cannot declare a system field, `titleField`,
  `columns`, `routes`, `overrides` or a custom table; `labels` may only name system fields.
- A block `component` must be a non-empty string naming a registered Nuxt component; `icon` must be
  a non-empty string.
- `titleField` is required on collections, must reference a declared field, and that field must be a
  `text`, `slug`, `email`, `number`, `date`, `datetime` or single `select`.
- `select` needs a non-empty array of unique `options`.
- Multi-select (`select` with `multiple: true`) is not allowed inside `blocks` and is excluded from filters and sorting.
- `translatable` is only valid on `text`, `richtext` and `media`, at the top level or inside a block, and requires `cms.i18n.locales`. The `blocks` field itself cannot be translatable.
- `showIf` must reference another declared field of a comparable type, cannot be used on the `titleField` or inside `blocks`, and needs exactly one of `eq` / `in`.
- `tab` must name a tab declared by the same entry; tab ids must be unique and every tab needs a label.
- `slug.from` must point to a non-translatable `text` field (the `slug` of a content entry is the
  only exception: it reads the default locale of the title).
- `private` is not allowed inside `blocks`.
- A relation `to` must reference an existing collection or content entry.
- `columns` is only valid on the page entry and may only list fields that every page has;
  `relation` and `slug` fields of a page must be listed there, and pages cannot have many-to-many
  relations or a custom table.

After changing the schema, restart the dev server so migrations and types are regenerated.
