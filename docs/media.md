# Media

Media (images, video, documents) can be stored three ways, selected with `cms.media.storage`
(default `'s3'`):

- **`'s3'`** — **S3-compatible object storage**: AWS S3, Cloudflare R2, MinIO, Backblaze B2, and
  similar. The database stores only metadata; the files live in your bucket. When media is not
  configured, media endpoints return `501` and `media` fields cannot be uploaded to.
- **`'local'`** — the files in your `public/` folder **are** the library: no bucket, no credentials,
  no uploads. Only alt text is editable. Files
  are expected to already live wherever `publicBaseUrl` points (e.g. your app's own `public/`
  directory, or any URL you serve yourself). When `publicBaseUrl` is a root-relative path, the
  library is **read from that folder** on every request, so the gallery mirrors what the running
  deployment actually ships. Use
  this when you manage files outside the CMS (deploy-time assets, a separate pipeline, …) but still
  want to pick them from the media field picker.
- **`'filesystem'`**: uploads are written to a directory on the server's disk (default
  `data/media`) and the module serves them itself under `publicBaseUrl` (default `/media`). No
  bucket and no credentials. Use this on a server or a container with a persistent volume.

## Configuration

```ts
cms: {
   media: {
      storage: 's3',                // 's3' | 'local' | 'filesystem' (default 's3')
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
  value (`/images`) in `'local'` mode also selects the folder the library is read from
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
from the file itself, `folder` from the parent directory. The `key` is the path relative to that
folder, POSIX-style: `hero.webp`, `waters/avisio-river.webp`. Sub-directories are walked
recursively. Only known media extensions are picked up (`jpg`, `jpeg`, `png`, `webp`, `avif`, `gif`,
`svg`, `mp4`, `m4v`, `webm`, `mkv`, `mov`, `mp3`, `wav`, `ogg`, `m4a`, `pdf`); dotfiles and anything
else are ignored.

Dimensions are read for PNG, JPEG, WebP and GIF images, and for MP4, M4V, MOV, WebM and MKV videos:
the video track's display size, with a quarter-turn rotation matrix applied, so a portrait phone
clip reports `1080x1920` rather than `1920x1080`. An MP4 whose `moov` box sits at the end of the
file is handled too, so `-movflags +faststart` is not required just to get dimensions. Everything
else keeps `width` and `height` at `null`.

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

## Filesystem mode (files on the server's disk)

With `storage: 'filesystem'` the admin panel uploads work like in `'s3'` mode, but the files go to
a directory on the server:

```ts
cms: {
   media: {
      storage: 'filesystem',
      dir: 'data/media',       // default, relative to rootDir or absolute
      publicBaseUrl: '/media', // default, must be a root-relative path
      maxFileSize: 10485760,
   },
}
```

- **`dir`** (`NUXT_CMS_MEDIA_DIR`): the directory that holds the files. A relative path is resolved
  against the app's `rootDir`. Set the env var at runtime to point at a mounted volume, for example
  `NUXT_CMS_MEDIA_DIR=/data/media`.
- **`publicBaseUrl`**: the path where the module serves the files, with `GET` and `HEAD`, byte
  ranges, an `ETag` and an immutable cache header. It must be root-relative. `/` and paths under
  `/api/` are refused at build time. The route is registered at build time, so change it in
  `nuxt.config` and not with an env var.
- The browser sends the file with an authenticated `PUT` to `/api/cms/admin/media/upload`. The
  server streams it to a temporary file, stops at `maxFileSize` with `413`, and then renames it
  into place. An existing key answers `409`.
- Folders are real directories. A folder marker `.keep` keeps an empty folder, and the file route
  never serves it. Deleting the last file of a folder removes the empty directories.
- Keys that leave the directory (`..`, absolute paths, backslashes) are rejected. A file with a
  content type that is not allowed for upload is served as an attachment with
  `x-content-type-options: nosniff`.

The directory must survive restarts and deploys. Mount a persistent volume in a container, and do
not use this mode on serverless hosts, where the function's disk is temporary.

## Upload flow (`'s3'` mode)

Uploads go **directly from the browser to your bucket** using a presigned URL; the file never passes
through the Nitro server. From the admin panel:

1. The server issues a presigned upload URL (valid for `presignExpiry` seconds).
2. The browser uploads the file straight to object storage with that URL.
3. The server records the media metadata (key, mime, size, dimensions). Dimensions are measured in
   the browser before the upload: images through `createImageBitmap`, videos from the loaded
   metadata of a detached `<video>` element.

This all happens through the panel's internal, authenticated same-origin API — there is nothing to
call yourself.

## Folders and the media library

The library shows one folder at a time, like a file browser. Folders can hold subfolders, up to 4
levels. In `'s3'` and `'filesystem'` mode you manage the folders from the panel:

- Click a folder to open it. The breadcrumb above the grid goes back to a parent folder. The admin
  page keeps the open folder in the URL (`/cms/media?folder=blog/covers`).
- **New folder** creates a subfolder in the open folder. **Rename** and **Delete folder** show
  only when a folder is open, and they apply to that folder.
- Drag a file onto a folder or onto the breadcrumb to move it. Drag a folder onto another folder
  to move it with all its contents. Drop files from your computer on the library to upload them to
  the open folder, or on a folder to upload them there.
- Select files with the round check on a tile, or with Shift, Ctrl or Cmd and a click. The
  selection bar moves or deletes all the selected files.
- Click a file to open its detail panel: preview, facts, alt text, folder, a **Copy URL** button
  and the list of entries that use the file.
- The search looks in the open folder and its subfolders. **Search all folders** extends it to the
  full library. The search matches the file name, the alt text and the folder.
- Sort by date, name or size, and switch between the grid and the list view. The panel remembers
  the view in the browser.

The media field picker uses the same browser. It adds a **Recent** row with the latest uploads,
and it opens in the last folder that you used.

How folders are stored:

- A folder is created as an empty object `<folder>/.keep` (a file in `'filesystem'` mode), plus
  one `cms_media` row. The marker keeps an empty folder alive between sessions, and it never shows
  up in the gallery.
- A folder name is slugified and holds at most 4 levels (`Foto Estate/2026` gives
  `foto-estate/2026`).
- Uploads into a folder get the key `<folder>/<uuid>-<name>`.
- To move a file or to rename a folder changes only the `folder` column. The object key, and so
  the public URL, stays the same. Entries that use the file keep working.
- Deleting a folder deletes every file in it and in its subfolders, the markers included, and the
  matching rows. The confirmation says how many files and subfolders go with it, and how many
  entries use them.

In `'local'` mode the folders are the sub-directories of `publicBaseUrl`. You can browse and search
them, but you cannot change them from the panel: create or delete them in your repository.

### Admin endpoints

The panel uses these authenticated, same-origin endpoints under `/api/cms/admin/media`:

| Method and path | Body or query | Effect |
| --- | --- | --- |
| `POST /folders` | `{ name }` | Creates a folder. |
| `PATCH /folders` | `{ from, to }` | Renames or moves a folder and its subfolders. |
| `DELETE /folders` | `?name=&recursive=` | Deletes a folder. Without `recursive=true` a folder with files answers `409`. |
| `POST /move` | `{ keys, folder }` | Moves files to a folder (`null` is the library root). |
| `POST /delete` | `{ keys }` | Deletes files. |
| `POST /usage` | `{ keys }` | Returns, for each key, the entries and fields that use it. |

`PATCH /folders` answers `400` when the target is inside the folder itself, or when the result is
deeper than 4 levels.

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

`mediaType` also takes a list, for a slot that accepts more than one kind of file. The picker then
shows only those types, with a filter pill for each, and uploads are restricted to them:

```ts
poster: { label: 'Poster', type: 'media', mediaType: ['image', 'video'] }
```

Omitting `mediaType`, or setting it to `'file'` (on its own or inside the list), leaves the field
unrestricted.

In GraphQL it resolves to a `CmsMedia` object:

```graphql
poster { key url type alt folder mime size width height }
```

The database stores only the **`key`** (the object path in your bucket). In queries:
- **`url`** is constructed as `publicBaseUrl` + "/" + `key` (e.g. `https://cdn.example.com/2024/photo.jpg`).
- A relative `publicBaseUrl` (e.g. `/images`) also works and yields site-relative urls like `/images/waters/photo.jpg`, useful when files are served from the app's own `public/` directory.
- When `publicBaseUrl` is empty, `url` is `null`; construct it yourself from `key`.
- **`type`** is the enum `CmsMediaType`, derived from the mime type (`image` / `video` / `file`). In `#cms-types` the field is narrowed to the declared `mediaType`, for example `CmsMedia<'image' | 'video'>`.

**Missing files on pages.** Saving a page from the admin fails with a 400 when a media field, or a
media field inside a block, points at a key that is not in the library (the folder or the build
manifest in local mode, `cms_media` in `'s3'` mode; the check is skipped in local mode when no
folder was found). The admin form marks a saved media whose file is no longer in the library, so it
can be replaced before saving. Collections and singles are not checked.

## One file per locale

A media field marked `translatable: true` stores a different key per locale and still resolves to a
single `CmsMedia`, picked from the query's `locale` argument:

```ts
brochure: { label: 'Brochure', type: 'media', mediaType: 'file', translatable: true }
```

See [Schema → Translatable media](schema.md#translatable-media).

See [Querying → Media](querying.md#media).
