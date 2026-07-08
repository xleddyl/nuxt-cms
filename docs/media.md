# Media

Media (images, video, documents) is stored in **S3-compatible object storage** — AWS S3, Cloudflare
R2, MinIO, Backblaze B2, and similar. The database stores only metadata; the files live in your
bucket. When media is not configured, media endpoints return `501` and `media` fields cannot be
uploaded to.

## Configuration

```ts
cms: {
   media: {
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

- **`endpoint` / `bucket` / `accessKeyId` / `secretAccessKey`** — S3 connection. All four are
  required for media to work.
- **`publicBaseUrl`** (`NUXT_PUBLIC_CMS_MEDIA_BASE_URL`) — the public base URL prepended to object
  keys to build the URL returned in queries. Point it at your bucket's public domain or CDN.
- **`region`** — S3 region (default `auto`, which suits R2).
- **`presignExpiry`** — how many seconds a presigned upload URL stays valid (default 600).

## Upload flow

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

`url` is `publicBaseUrl` + key; `type` is derived from the mime type (`image` / `video` / `file`).
See [Querying → Media](querying.md#media).
