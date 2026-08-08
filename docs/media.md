# Media

Media (images, video, documents) can be stored two ways, selected with `cms.media.storage`
(default `'s3'`):

- **`'s3'`** — **S3-compatible object storage**: AWS S3, Cloudflare R2, MinIO, Backblaze B2, and
  similar. The database stores only metadata; the files live in your bucket. When media is not
  configured, media endpoints return `501` and `media` fields cannot be uploaded to.
- **`'local'`** — the files in your `public/` folder **are** the library: no bucket, no credentials,
  no uploads. Only alt text is editable. Files
  are expected to already live wherever `publicBaseUrl` points (e.g. your app's own `public/`
  directory, or any URL you serve yourself). When `publicBaseUrl` is a root-relative path, the
  library is **synced from disk at server startup**, so the gallery always mirrors the folder. Use
  this when you manage files outside the CMS (deploy-time assets, a separate pipeline, …) but still
  want to pick them from the media field picker.

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
      maxFileSize: 10485760,
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
NUXT_CMS_MEDIA_MAX_FILE_SIZE=52428800
```

- **`storage`** — `'s3'` (default) enables uploads against object storage; `'local'` turns the
  media library file-backed, listing the folder `publicBaseUrl` points to, and
  does not accept the S3 keys at all (`endpoint` / `bucket` / `accessKeyId` / `secretAccessKey` are
  rejected at the type level in `'local'` mode, and `publicBaseUrl` is required there).
- **`endpoint` / `bucket` / `accessKeyId` / `secretAccessKey`** — S3 connection, required when
  `storage` is `'s3'`.
- **`publicBaseUrl`** (`NUXT_PUBLIC_CMS_MEDIA_BASE_URL`) — the public base URL prepended to object
  keys to build the URL returned in queries. Point it at your bucket's public domain or CDN in
  `'s3'` mode, or at wherever your host app serves the files from in `'local'` mode. A root-relative
  value (`/images`) in `'local'` mode also selects the folder synced at startup
  (`<rootDir>/public/images`).
- **`region`** — S3 region (default `auto`, which suits R2). Unused in `'local'` mode.
- **`presignExpiry`** — how many seconds a presigned upload URL stays valid (default 600). Unused
  in `'local'` mode.
- **`maxFileSize`** (`NUXT_CMS_MEDIA_MAX_FILE_SIZE`): the largest single upload accepted, in bytes
  (default `10485760`, i.e. 10 MB). Must be a positive integer. The admin panel checks it before
  uploading and the presign endpoint rejects anything larger with `413`. Raise it for large assets
  such as magazine PDFs, and keep any bucket or proxy limits in mind. Unused in `'local'` mode.

## Local mode (files own the library)

With `storage: 'local'` the files in your `public/` folder **are** the media library. The `cms_media`
table is not a copy of them: it only stores the `alt` texts you write. Nothing syncs, nothing
reconciles, and there is no background job that can disagree with what is on disk.

- `GET` (the admin listing and the media field picker) reads the file list directly from the source
  described below and left-joins the alt texts.
- **Alt text is editable**, in the admin panel like in `'s3'` mode.
- Uploading, deleting and moving a file between folders are disabled, because the files belong to
  your repository: the UI hides the dropzone and the delete action, `folder` is derived from the
  file's own path, and `presign`, `POST` and `DELETE` answer `501` if called directly.

### Where the file list comes from

`publicBaseUrl` must be a root-relative path (e.g. `/images`); the module resolves it against the
app's public directory (`<rootDir>/public/images`). The list is then resolved in this order:

1. **the folder on disk**, whenever it exists (dev, and any deploy that ships the source tree). Read
   live, with a one-second cache, so adding a file and refreshing the page is enough — no restart.
2. **the build manifest**, otherwise. At build time the module scans the folder and bakes the result
   into the server bundle as `cms/media-manifest.js` (key, folder, mime, size, width, height, plus
   the build timestamp).
3. **nothing**, if neither is available: the library renders empty and the admin panel says so.

Both paths produce the same metadata: mime from the extension, size from the file, width/height read
from the file header for PNG, JPEG, WebP and GIF, `folder` from the parent directory. The `key` is
the path relative to that folder, POSIX-style: `hero.webp`, `waters/avisio-river.webp`.
Sub-directories are walked recursively. Only known media extensions are picked up (`jpg`, `jpeg`,
`png`, `webp`, `avif`, `gif`, `svg`, `mp4`, `webm`, `mov`, `mp3`, `wav`, `ogg`, `m4a`, `pdf`);
dotfiles and anything else are ignored.

### Serverless hosts

On a serverless host the `public/` folder is not on the function's filesystem: Vercel, for example,
ships it to the static/CDN layer (`.vercel/output/static`) while the server code runs from a separate
bundle. Step 1 above is therefore impossible there and the manifest is what gets used.

The practical consequence: **on serverless hosts files are picked up at build time**. Add an image to
`public/images`, commit, and deploy *that commit*. Dropping a file into the CDN out of band does
nothing, and neither does re-deploying an older build: a "Redeploy" button that rebuilds a previous
snapshot rebuilds that snapshot's manifest too. The admin panel prints which source it is using and,
for a manifest, when it was built.

### Why there is no sync

Earlier versions reconciled `cms_media` against the folder at every server boot. That is unsound as
soon as two environments share one database: local dev reconciles against the live folder, production
against the manifest frozen into its deployment, and each deletes the rows the other just wrote.
Reading the list per-environment and keeping only `alt` in the database removes the shared mutable
state entirely, so **dev and production can safely share one database**.

Consequences worth knowing:

- Dev sees a new file immediately; production sees it after a deploy. This divergence is by design
  and is surfaced in the UI rather than papered over.
- An `alt` whose file is later removed stays in the table as a harmless orphan, and reattaches by
  itself if the file comes back. **It is never pruned** — pruning against one environment's partial
  view is exactly the bug described above.
- If `publicBaseUrl` is an absolute `http(s)` URL, no folder can be resolved and the library is
  empty. The build warns about it.

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

Anything else is rejected with `415 Unsupported content type`, and anything larger than
`media.maxFileSize` with `413`.

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

## One file per locale

A media field marked `translatable: true` stores a different key per locale and still resolves to a
single `CmsMedia`, picked from the query's `locale` argument:

```ts
brochure: { label: 'Brochure', type: 'media', mediaType: 'file', translatable: true }
```

See [Schema → Translatable media](schema.md#translatable-media).

See [Querying → Media](querying.md#media).
