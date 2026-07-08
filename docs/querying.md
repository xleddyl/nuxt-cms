# Querying content

Content is read through a **public, read-only GraphQL API** at `POST /api/cms/graphql`. Two
auto-imported composables wrap it and are typed end-to-end from the query string via gql.tada — no
codegen step, no manual types.

```ts
// reactive, SSR-friendly (wraps useAsyncData) — use in components/pages
const { data, error, refresh } = useCms(`{ ... }`, variables?)

// plain promise — use in event handlers or server-side logic
const result = await $cmsQuery(`{ ... }`, variables?)
```

`useCms` keys the cache on the query + variables and returns Nuxt's `AsyncData`. `$cmsQuery` throws
if the response contains GraphQL errors.

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

## Filters, sorting, pagination

**Filterable fields:** `id`, `createdAt`, `updatedAt`, and every field except `json`, `blocks`,
`translatable` text, and `many-to-many` relations. Single relations filter by the related id as a
`StringFilter`.

**Operators:**

- String: `eq neq gt gte lt lte like in isNull`
- Int / Float: `eq neq gt gte lt lte in isNull`
- Boolean: `eq neq isNull`

**Sort:** `[{ field: <fieldName>, direction: asc | desc }]` (`direction` defaults to `asc`).

**Pagination:** `limit` and `offset`.

## Media

`media` fields resolve to:

```graphql
poster { key url type alt folder mime size width height }
```

## Blocks

`blocks` fields are unions — use inline fragments. Block type names are `<Entry><Field><Block>`:

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
- `locale` omitted → `defaultLocale`; unknown locale → error; missing translation → falls back to
  `defaultLocale`.
- Relations resolve nested entries (localized with the parent's `locale`). A required many-to-one
  pointing to a drafted (unpublished) entry can still resolve to `null`.
- Query nesting depth is capped by `cms.graphql.maxDepth` (default 8); deeper queries are rejected.
- In development a GraphiQL explorer is served at `/api/cms/graphql`.
