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
      kind: 'collection' | 'single',
      titleField: 'name',          // collections: required, field used as the entry title
      drafts: true,                // optional; adds draft/published status
      fields: { <fieldKey>: <FieldInput>, ... },
   },
})
```

## Entries

- **`collection`** — many rows, with list + detail + count queries.
- **`single`** — one document, with a single query.
- `id` (equal to the object key), `label`, `kind` and `fields` are required.
- `titleField` is **required on collections** and not allowed on singles. It picks the field used as
  the entry title: in the admin list, in relation pickers, and to render relation columns (a
  relation cell shows the target's title instead of its id). It must be a `text`, `slug`, `email`,
  `number`, `date` or single `select` field, and it is the field the admin search matches on.
- `drafts: true` (collections only) adds a draft/published status. **The public GraphQL API returns
  published rows only** — drafts are invisible to it.
- `id`, `createdAt` (collections only) and `updatedAt` are managed automatically — never declare
  them as fields. Row ids are opaque strings.

The GraphQL type name is the PascalCase of the entry key (`blog_posts` → `BlogPosts`).

## Field types

Every field has `label: string` and optional `required?: boolean` and `private?: boolean` (see
[Private fields](#private-fields)). Type-specific options:

| type       | extra options                                                                      | stored / queried as |
| ---------- | ---------------------------------------------------------------------------------- | ------------------- |
| `text`     | `textarea?: boolean`, `translatable?: boolean`                                      | String              |
| `richtext` | `translatable?: boolean`                                                            | String (HTML)       |
| `number`   | `integer?: boolean`                                                                 | Float / Int         |
| `boolean`  | —                                                                                   | Boolean             |
| `date`     | —                                                                                   | String `yyyy-mm-dd` |
| `email`    | —                                                                                   | String              |
| `slug`     | `from: '<fieldKey>'` (required; auto-generated from that text field)                | String (unique)     |
| `select`   | `options: string[]` (required, unique), `multiple?: boolean`                        | String (enum) or `[String!]!` |
| `json`     | —                                                                                   | JSON                |
| `media`    | `mediaType?: 'image' \| 'video' \| 'file'`, `accept?: string[]`, `translatable?: boolean` | CmsMedia object     |
| `relation` | see [Relations](#relations)                                                         | related entry / list |
| `blocks`   | `blocks: Record<name, { label, fields }>` (required)                                | array of typed blocks |

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

- The target `to` must be a **collection**.
- `many-to-one` / `one-to-one` store a foreign key on the entry; `many-to-many` uses a generated
  join table (`<entry>_<field>`).
- A `required` relation cannot use `onDelete: 'set null'`.
- Custom-table entries cannot be the source of `many-to-many` relations.

## Blocks

A `blocks` field is an ordered list of typed content blocks — good for page builders.

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
(`select` with `multiple: true`). They can be `translatable` (see below) but not `private` — mark the
whole `blocks` field private instead.
See [Querying → Blocks](querying.md#blocks) for how to read them.

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
either — the field still resolves to a single `String` (or `CmsMedia`) for the requested `locale`.

In the admin panel the locale switcher appears next to the `blocks` field label and applies to every
translatable sub-field of every block at once, so a whole list can be translated in one pass.

## Conditional fields

`showIf` hides a field in the admin editor until another field of the same entry has a given value —
useful when one `select` decides which of the remaining fields are meaningful.

```ts
type: { label: 'Type', type: 'select', options: ['text', 'image'], required: true },
body:  { label: 'Body',  type: 'richtext', showIf: { field: 'type', eq: 'text' } },
photo: { label: 'Photo', type: 'media', showIf: { field: 'type', eq: 'image' } },
```

- Use `eq` for a single value or `in` for a list; pass an **array of conditions** to require all of
  them (AND).
- **Only the admin editor is affected.** The GraphQL schema, the database column and the query shape
  are unchanged — a condition cannot make a column conditional.
- A hidden field **keeps the value it already has**; it is not cleared on save, so toggling the
  controlling field back and forth does not lose work.
- On a conditional field, `required` means **"required while visible"**: it is enforced by the admin
  form only. The column stays nullable and the GraphQL field stays optional, because two fields
  belonging to opposite branches can never both be filled — a `NOT NULL` on either would make every
  entry unsavable. Treat a conditional field as optional when you read it.
- The condition may point at a `select`, `boolean`, `text`, `number`, `date`, `email` or `slug`
  field — not at `blocks`, `relation`, `media`, `json`, multi-select or translatable fields, whose
  values have no single comparable form.
- When the target is a `select`, the referenced values are checked against its `options` at build
  time, so a typo fails the build instead of silently hiding the field forever.
- The `titleField` cannot be conditional, and `showIf` is not supported inside `blocks`.

## Private fields

`private: true` keeps a field out of the **public GraphQL API**. The column is still created, the
field is still editable in the admin panel and its value is still stored — it is simply never
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

`translatable: true` is supported on `text`, `richtext` and `media` — both as top-level fields and
[inside blocks](#translatable-block-fields) — and requires `cms.i18n.locales` to be configured. Values are stored per locale and resolved to a single value at query time via the
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
         poster: { label: 'Poster', type: 'media', mediaType: 'image' },
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

- Entry keys and field keys must be valid identifiers; some names are reserved (`admin`, `auth`,
  `login`, `media`, `graphql`, …) and so are the automatic columns (`id`, `status`, `created_at`,
  `updated_at`).
- `drafts` is only valid on collections.
- `titleField` is required on collections, must reference a declared field, and that field must be a
  `text`, `slug`, `email`, `number`, `date` or single `select`.
- `select` needs a non-empty array of unique `options`.
- Multi-select (`select` with `multiple: true`) is not allowed inside `blocks` and is excluded from filters and sorting.
- `translatable` is only valid on `text`, `richtext` and `media`, at the top level or inside a block, and requires `cms.i18n.locales`. The `blocks` field itself cannot be translatable.
- `showIf` must reference another declared field of a comparable type, cannot be used on the `titleField` or inside `blocks`, and needs exactly one of `eq` / `in`.
- `slug.from` must point to a non-translatable `text` field.
- `private` is not allowed inside `blocks`.
- A relation `to` must reference an existing collection.

After changing the schema, restart the dev server so migrations and types are regenerated.
