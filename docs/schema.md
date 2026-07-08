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
      titleField: 'name',          // collections: field shown as the entry title in admin
      drafts: true,                // optional; adds draft/published status
      fields: { <fieldKey>: <FieldInput>, ... },
   },
})
```

## Entries

- **`collection`** — many rows, with list + detail + count queries.
- **`single`** — one document, with a single query.
- `id` (equal to the object key), `label`, `kind` and `fields` are required.
- `titleField` (collections) picks the field shown as the entry title in the admin list.
- `drafts: true` (collections only) adds a draft/published status. **The public GraphQL API returns
  published rows only** — drafts are invisible to it.
- `id`, `createdAt` (collections only) and `updatedAt` are managed automatically — never declare
  them as fields. Row ids are opaque strings.

The GraphQL type name is the PascalCase of the entry key (`blog_posts` → `BlogPosts`).

## Field types

Every field has `label: string` and optional `required?: boolean`. Type-specific options:

| type       | extra options                                                                      | stored / queried as |
| ---------- | ---------------------------------------------------------------------------------- | ------------------- |
| `text`     | `textarea?: boolean`, `translatable?: boolean`                                      | String              |
| `richtext` | `translatable?: boolean`                                                            | String (HTML)       |
| `number`   | `integer?: boolean`                                                                 | Float / Int         |
| `boolean`  | —                                                                                   | Boolean             |
| `date`     | —                                                                                   | String `yyyy-mm-dd` |
| `email`    | —                                                                                   | String              |
| `slug`     | `from: '<fieldKey>'` (required; auto-generated from that text field)                | String (unique)     |
| `select`   | `options: string[]` (required, unique)                                              | String (enum)       |
| `json`     | —                                                                                   | JSON                |
| `media`    | `mediaType?: 'image' \| 'video' \| 'file'`, `accept?: string[]`                     | CmsMedia object     |
| `relation` | see [Relations](#relations)                                                         | related entry / list |
| `blocks`   | `blocks: Record<name, { label, fields }>` (required)                                | array of typed blocks |

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

Block fields accept every field type **except** `slug`, `relation`, `blocks`, and `translatable`.
See [Querying → Blocks](querying.md#blocks) for how to read them.

## Translatable fields

`translatable: true` is supported on `text` and `richtext` only, and requires `cms.i18n.locales`
to be configured. Values are stored per locale and resolved to a single String at query time via the
`locale` argument (falling back to `defaultLocale` when a translation is missing).

```ts
i18n: { locales: ['en', 'it'], defaultLocale: 'en' } // in nuxt.config.ts

description: { label: 'Description', type: 'richtext', translatable: true } // in cms.config.ts
```

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
- `titleField` must reference a declared field.
- `select` needs a non-empty array of unique `options`.
- `slug.from` must point to a non-translatable `text` field.
- A relation `to` must reference an existing collection.

After changing the schema, restart the dev server so migrations and types are regenerated.
