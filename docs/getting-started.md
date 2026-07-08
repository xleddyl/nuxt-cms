# Getting started

## 1. Install

```bash
npm install @xleddyl/nuxt-cms
# or: pnpm add @xleddyl/nuxt-cms
```

## 2. Register the module

Add it to `nuxt.config.ts` and configure it under the `cms` key:

```ts
export default defineNuxtConfig({
   modules: ['@xleddyl/nuxt-cms'],
   cms: {
      database: {
         driver: 'sqlite', // 'sqlite' | 'postgres' | 'libsql'
         path: 'data/cms.db',
      },
      i18n: {
         locales: ['en', 'it'], // only needed if you use translatable fields
         defaultLocale: 'en',
      },
   },
})
```

See [Configuration](configuration.md) for every option and [Database](database.md) for Postgres and
libSQL/Turso.

## 3. Set the required environment variables

The admin login is a single account read from env, and production sessions need an encryption key:

```bash
NUXT_CMS_ADMIN_EMAIL=admin@example.com
NUXT_CMS_ADMIN_PASSWORD=change-me
NUXT_SESSION_PASSWORD=a-random-string-of-at-least-32-characters
```

The full list (media, remote DB credentials, …) is in [Configuration](configuration.md#environment-variables).

## 4. Declare your content types

Create `cms.config.ts` at the project root:

```ts
import { defineCmsConfig } from '#nuxt-cms'

export default defineCmsConfig({
   posts: {
      id: 'posts',
      label: 'Posts',
      kind: 'collection',
      titleField: 'title',
      drafts: true,
      fields: {
         title: { label: 'Title', type: 'text', required: true },
         slug: { label: 'Slug', type: 'slug', from: 'title', required: true },
         body: { label: 'Body', type: 'richtext' },
      },
   },
})
```

The full field reference is in [Schema](schema.md).

## 5. Run

```bash
npm run dev
```

On boot the module generates and applies migrations, then serves:

- the **admin panel** at [`http://localhost:3000/cms`](http://localhost:3000/cms)
- the **GraphQL API** at `POST /api/cms/graphql`

Log in at `/cms/login` with the admin credentials, create an entry, then read it from your app:

```ts
const { data } = useCms(`{
   posts(limit: 10, sort: [{ field: title, direction: asc }]) {
      id title slug
   }
}`)
```

Continue with [Querying content](querying.md).

## After changing the schema

Migrations are generated and applied on dev boot. After editing `cms.config.ts`, restart the dev
server so the new schema, types and migrations are regenerated and applied.
