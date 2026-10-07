import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import {
   createError,
   defineEventHandler,
   getRequestURL,
   getValidatedQuery,
   sendRedirect,
   sendStream,
   setResponseHeaders,
} from 'h3'
import { z } from 'zod'
import { useDb } from '#cms-db'
import { cms_media } from '#cms-tables'
import { useRuntimeConfig } from '#imports'
import { isMediaFolderMarker, mediaFilename, mediaPublicUrl } from '../../shared/index'
import { objectKeySchema } from '../../shared/validation'
import { encodeKey, presignedDownloadUrl, useMediaConfig } from '../utils/media'
import { attachmentDisposition } from '../utils/media-download'
import { mediaFilePath } from '../utils/media-fs'
import { useMediaIndex } from '../utils/media-index'
import { mediaMimeForKey } from '../utils/media-sync'
import { requireAdmin } from '../utils/require-admin'

const querySchema = z.object({ key: objectKeySchema })

function notFound(): never {
   throw createError({ statusCode: 404, statusMessage: 'Media not found' })
}

async function assertKnownRow(key: string) {
   const [row] = await useDb()
      .select({ mime: cms_media.mime })
      .from(cms_media)
      .where(eq(cms_media.key, key))
      .limit(1)
   if (!row) notFound()
   return row.mime
}

async function sendDiskFile(
   event: H3Event,
   root: string,
   key: string,
   mime: string | null,
   disposition: string
) {
   const path = mediaFilePath(root, key)
   if (!path) throw createError({ statusCode: 400, statusMessage: 'Invalid object key' })
   const info = await stat(path).catch(() => null)
   if (!info?.isFile()) notFound()
   setResponseHeaders(event, {
      'content-type': mime ?? mediaMimeForKey(key) ?? 'application/octet-stream',
      'content-disposition': disposition,
      'content-length': info.size,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
   })
   return sendStream(event, createReadStream(path))
}

async function sendRemoteFile(event: H3Event, baseUrl: string, key: string, disposition: string) {
   const publicUrl = mediaPublicUrl(baseUrl, encodeKey(key))
   if (!publicUrl) notFound()
   const upstream = await fetch(new URL(publicUrl, getRequestURL(event).origin))
   if (!upstream.ok || !upstream.body) {
      throw createError({
         statusCode: 502,
         statusMessage: `Media source answered ${upstream.status}`,
      })
   }
   const length = upstream.headers.get('content-length')
   setResponseHeaders(event, {
      'content-type':
         upstream.headers.get('content-type') ?? mediaMimeForKey(key) ?? 'application/octet-stream',
      'content-disposition': disposition,
      ...(length ? { 'content-length': Number(length) } : {}),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
   })
   return sendStream(event, upstream.body)
}

export default defineEventHandler(async (event) => {
   await requireAdmin(event)
   const { media } = useMediaConfig(event)
   const { key } = await getValidatedQuery(event, querySchema.parse)
   if (isMediaFolderMarker(key)) notFound()
   const disposition = attachmentDisposition(mediaFilename(key))

   if (media.storage === 's3') {
      await assertKnownRow(key)
      return sendRedirect(event, await presignedDownloadUrl(media, key, disposition), 302)
   }

   if (media.storage === 'filesystem') {
      const mime = await assertKnownRow(key)
      return sendDiskFile(event, media.dir!, key, mime, disposition)
   }

   const file = (await useMediaIndex()).get(key)
   if (!file) notFound()
   const { localRoot } = useRuntimeConfig(event).cms.media as { localRoot?: string }
   if (localRoot && existsSync(localRoot)) {
      return sendDiskFile(event, localRoot, key, file.mime, disposition)
   }
   const { mediaBaseUrl } = useRuntimeConfig(event).public.cms as { mediaBaseUrl: string }
   return sendRemoteFile(event, mediaBaseUrl, key, disposition)
})
