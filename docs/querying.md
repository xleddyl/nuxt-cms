# Querying content

Content is read through a **public, read-only GraphQL API** at `POST /api/cms/graphql`. Four
auto-imported composables wrap it.

```ts
// one entry, query and types generated from cms.config.ts — no query string to write
const { data } = await useCmsSingle('homepage', { locale })
const { data } = await useCmsCollection('events', { sort: [{ field: 'date' }], limit: 10 })
const { data } = await useCmsPage('/about', { locale })

// reactive, SSR-friendly (wraps useAsyncData) — use in components/pages
const { data, error, refresh } = useCms(`{ ... }`, variables?, options?)

// plain promise — use in event handlers or server-side logic
const result = await $cmsQuery(`{ ... }`, variables?)
```

`useCms` and `$cmsQuery` are typed end-to-end from the query string via gql.tada, with no codegen
step and no manual types.

`useCms` keys the cache on the query + variables and returns Nuxt's `AsyncData`. `$cmsQuery` throws
if the response contains GraphQL errors.

A third argument forwards options to `useAsyncData`. `key` replaces the generated cache key.
`default` gives the value that `data` holds before the query resolves and after it fails, which
keeps a failed query out of the rendering path. `server`, `lazy`, `immediate`, `deep`, `dedupe` and
`watch` are passed through unchanged.

```ts
const { data } = await useCms(query, { locale }, {
   key: `page:${path}:${locale}`,
   default: () => null,
})
```

With [`cms.enabled: false`](configuration.md#enabled) the five composables stay defined but become
no-ops: `useCms().data`, `useCmsSingle().data` and `useCmsPage().data` are `null`,
`useCmsCollection().data` is `[]` and `$cmsQuery()` resolves to `{}`. The generated types stay available too, so the same code type-checks
in both modes. Callers therefore never need a `typeof useCms === 'function'` guard, they just render
their empty state.

## Entry helpers

`useCmsSingle`, `useCmsCollection` and `useCmsPage` build the query from `cms.config.ts`, so adding
a field to an entry adds it to the result with no change in the page.

```ts
const { data: home } = await useCmsSingle('homepage', { locale: 'it' })
home.value?.heroTitle

const { data: events } = await useCmsCollection('events', {
   filters: { date: { gte: '2026-01-01' } },
   sort: [{ field: 'date', direction: 'desc' }],
   limit: 10,
   offset: 0,
   locale: 'it',
})
events.value[0]?.poster?.url
```

What they select:

- every public field of the entry, plus `id` and `updatedAt` (and `createdAt` for a collection);
- media fields with all their keys (`key url type alt folder mime size width height`);
- blocks fields with `type` plus an inline fragment per block type;
- relations one level deep. The related entry brings its own fields, but not its own relations.

`data` holds `null` for a single and `[]` for a collection before the query resolves and after it
fails. Both helpers accept the same `useAsyncData` options as `useCms`, `key` and `default`
included. `sort.field` accepts only the field names of that entry.

`useCmsPage` takes the path of a page of a [`page` entry](schema.md#pages) and returns exactly the
fields of that path, the shared ones plus its own:

```ts
const { data: page } = await useCmsPage('/about', { locale })
page.value?.intro
```

The path is typed: only the paths of the config are accepted, and `page.value` carries the fields of
that path alone. The entry also answers the generated queries `<entry>(locale)` for the whole list
and `<entry>ByPath(path, locale)` for one page.

Write a query with `useCms` when you need a count, a relation two levels deep, several entries in
one request, or a narrower selection.

## Generated queries

For each **collection** (e.g. `events`, GraphQL type `Events`):

```graphql
events(filters: EventsFilters, sort: [EventsSort!], limit: Int, offset: Int, locale: String): [Events!]!
eventsById(id: ID!, locale: String): Events
eventsCount(filters: EventsFilters): Int!
```

For each **single** (e.g. `homepage`):

```graphql
homepage(locale: String): Homepage
```

For a **page** entry (e.g. `pages`):

```graphql
pages(locale: String): [Pages!]!
pagesByPath(path: String!, locale: String): Pages
```

## Filters, sorting, pagination

**Filterable fields:** `id`, `createdAt`, `updatedAt`, and every field except `json`, `blocks`,
`translatable` fields, and `many-to-many` relations. Single relations filter by the related id as a
`StringFilter`. Non-translatable `media` fields filter and sort on the stored object key.

**Operators:**

- String: `eq neq gt gte lt lte like in isNull`
- Int / Float: `eq neq gt gte lt lte in isNull`
- Boolean: `eq neq isNull`

**Sort:** `[{ field: <fieldName>, direction: asc | desc }]` (`direction` defaults to `asc`).

**Pagination:** `limit` and `offset`.

## Media

`media` fields resolve to a `CmsMedia` object:

```graphql
poster { key url type alt folder mime size width height }
```

- **`key`**: the object key in your S3-compatible storage (the media field stores only this).
- **`url`**: the public URL, built as `publicBaseUrl` + "/" + `key`. A relative `publicBaseUrl` (e.g. `/images`) gives a root-relative URL. `url` is `null` only when `publicBaseUrl` is not configured.
- **`type`**: the enum `CmsMediaType`, derived from the mime type: `image`, `video` or `file`.
- Other fields: metadata set at upload time (alt text, folder, dimensions).

## Blocks

Each `blocks` field has a GraphQL interface named `<Entry><Field>Block`, and every block type of
that field implements it. The interface holds `type` plus each field that all blocks of the field
declare. A field with one block type therefore needs no inline fragment:

```graphql
gallery { type hidden photo { url alt } }
```

Use an inline fragment to select the fields of one block type. Block type names are
`<Entry><Field><Block>`:

```graphql
body {
   type
   ... on EventsBodyHero { heading image { url alt } }
}
```

## Example

```ts
const { data } = useCms(`query ($cat: String!) {
   homepage(locale: "it") { heroTitle }
   events(
      filters: { date: { gte: "2026-01-01" }, category: { eq: $cat } }
      sort: [{ field: date, direction: desc }]
      limit: 10
      offset: 0
   ) {
      id title date slug
      poster { url alt }
      category { id name }
      tags { id name }
      body {
         type
         ... on EventsBodyHero { heading image { url alt } }
      }
   }
   eventsCount
}`, { cat: 'some-category-id' })
```

## Behavior notes

- Entries with `drafts: true` return **published rows only**; drafts are invisible to the API.
- Fields declared with [`private: true`](schema.md#private-fields) are absent from the schema
  entirely: they cannot be selected, filtered or sorted on, and introspection does not list them.
- `locale` omitted → `defaultLocale`; unknown locale → error; missing translation → falls back to
  `defaultLocale`.
- Relations resolve nested entries (localized with the parent's `locale`). A required many-to-one
  pointing to a drafted (unpublished) entry can still resolve to `null`.
- Query nesting depth is capped by `cms.graphql.maxDepth` (default 8); deeper queries are rejected.
- **SSR and hydration:** `useCms` queries must be awaited at the top level of `<script setup>` (or inside `await definePageMeta()` lifecycle) to ship server-rendered data to the client. Without awaiting, the page loads without the data until hydration:
  ```ts
  const { data } = await useCms(`{ ... }`)
  ```
- In development a GraphiQL explorer is served at `/api/cms/graphql`.
