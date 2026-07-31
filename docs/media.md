# Media

Media (images, video, documents) can be stored two ways, selected with `cms.media.storage`
(default `'s3'`):

- **`'s3'`** — **S3-compatible object storage**: AWS S3, Cloudflare R2, MinIO, Backblaze B2, and
  similar. The database stores only metadata; the files live in your bucket. When media is not
  configured, media endpoints return `501` and `media` fields cannot be uploaded to.
- **`'local'`** — the media library is **read-only**: no bucket, no credentials, no uploads. Files
  are expected to already live wherever `publicBaseUrl` points (e.g. your app's own `public/`
  directory, or any URL you serve yourself), and the admin gallery only lists/selects rows already
  registered in the database. Use this when you manage files outside the CMS (deploy-time assets,
  a separate pipeline, …) but still want to pick them from the media field picker.

## Configuration

```ts
cms: {
   media: {
      storage: 's3',                // 's3' | 'local' (default 's3')
      endpoint: 'https://<account>.r2.cloudflarestorage.com',
      region: 'auto',
      bucket: 'my-bucket',
      publicBaseUrl: 'https://cdn.example.com',
      presignExpiry: 600,
      accessKeyId: '...',
      secretAccessKey: '...',
   },
}
```

Prefer env vars for the secrets:

```bash
NUXT_CMS_MEDIA_ENDPOINT=https://<account>.r2.cloudflarestorage.com
NUXT_CMS_MEDIA_REGION=auto
NUXT_CMS_MEDIA_BUCKET=my-bucket
NUXT_CMS_MEDIA_ACCESS_KEY_ID=...
NUXT_CMS_MEDIA_SECRET_ACCESS_KEY=...
NUXT_PUBLIC_CMS_MEDIA_BASE_URL=https://cdn.example.com
```

- **`storage`** — `'s3'` (default) enables uploads against object storage; `'local'` turns the
  media library read-only and skips the S3 connection checks entirely (`endpoint` / `bucket` /
  `accessKeyId` / `secretAccessKey` are ignored).
- **`endpoint` / `bucket` / `accessKeyId` / `secretAccessKey`** — S3 connection, required when
  `storage` is `'s3'`.
- **`publicBaseUrl`** (`NUXT_PUBLIC_CMS_MEDIA_BASE_URL`) — the public base URL prepended to object
  keys to build the URL returned in queries. Point it at your bucket's public domain or CDN in
  `'s3'` mode, or at wherever your host app serves the files from in `'local'` mode.
- **`region`** — S3 region (default `auto`, which suits R2). Unused in `'local'` mode.
- **`presignExpiry`** — how many seconds a presigned upload URL stays valid (default 600). Unused
  in `'local'` mode.

## Local mode (read-only)

With `storage: 'local'`:

- `GET` (listing media in the admin panel and the media field picker) works exactly as in `'s3'`
  mode and needs no S3 config at all.
- Uploading, editing (alt/folder) and deleting are disabled: the admin UI hides the upload dropzone
  and the edit/delete actions, and the corresponding server endpoints (`presign`, `POST`, `PUT`,
  `DELETE`) respond with `501` ("Media storage is local; the media library is read-only") if called
  directly.
- Rows still need to exist in the `cms_media` table for editors to see and pick them; how they get
  there (a seed script, a migration, a separate admin tool) is up to your app.

## Upload flow (`'s3'` mode)

Uploads go **directly from the browser to your bucket** using a presigned URL; the file never passes
through the Nitro server. From the admin panel:

1. The server issues a presigned upload URL (valid for `presignExpiry` seconds).
2. The browser uploads the file straight to object storage with that URL.
3. The server records the media metadata (key, mime, size, dimensions).

This all happens through the panel's internal, authenticated same-origin API — there is nothing to
call yourself.

## Allowed file types

Uploads are restricted by content type:

- **Allowed prefixes:** `image/*`, `video/*`, `audio/*`, `font/*`.
- **Allowed documents:** PDF, ZIP, GZIP, JSON, plain text, CSV, Markdown, and Microsoft Office
  formats (Word, Excel, PowerPoint — both legacy and OOXML).
- **Blocked:** `image/svg+xml` (blocked even though it matches `image/*`).

Anything else is rejected with `415 Unsupported content type`.

## Using media in content

Add a `media` field to an entry (optionally constrained by `mediaType` / `accept`):

```ts
poster: { label: 'Poster', type: 'media', mediaType: 'image' }
```

In GraphQL it resolves to a `CmsMedia` object:

```graphql
poster { key url type alt folder mime size width height }
```

The database stores only the **`key`** (the object path in your bucket). In queries:
- **`url`** is constructed as `publicBaseUrl` + "/" + `key` (e.g. `https://cdn.example.com/2024/photo.jpg`).
- A relative `publicBaseUrl` (e.g. `/images`) also works and yields site-relative urls like `/images/waters/photo.jpg`, useful when files are served from the app's own `public/` directory.
- When `publicBaseUrl` is empty, `url` is `null`; construct it yourself from `key`.
- **`type`** is derived from the mime type (`image` / `video` / `file`).

See [Querying → Media](querying.md#media).
