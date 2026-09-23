import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import {
   createError,
   defineEventHandler,
   getRequestHeader,
   getRouterParam,
   sendStream,
   setResponseHeaders,
   setResponseStatus,
} from 'h3'
import { useDb } from '#cms-db'
import { cms_media } from '#cms-tables'
import { useRuntimeConfig } from '#imports'
import { isMediaFolderMarker } from '../../shared/index'
import { mediaFilePath, parseByteRange } from '../utils/media-fs'
import { isAllowedUploadType } from '../utils/media'
import { mediaMimeForKey } from '../utils/media-sync'

const IMMUTABLE = 'public, max-age=31536000, immutable'

function notFound(): never {
   throw createError({ statusCode: 404, statusMessage: 'Not found' })
}

function endWithoutBody(event: H3Event) {
   event.node.res.end()
}

async function mimeFor(key: string) {
   const [row] = await useDb()
      .select({ mime: cms_media.mime })
      .from(cms_media)
      .where(eq(cms_media.key, key))
      .limit(1)
   const mime = row?.mime || mediaMimeForKey(key)
   return mime && isAllowedUploadType(mime) ? mime : null
}

export default defineEventHandler(async (event) => {
   if (event.method !== 'GET' && event.method !== 'HEAD') {
      throw createError({ statusCode: 405, statusMessage: 'Method not allowed' })
   }
   const { dir } = useRuntimeConfig(event).cms.media as { dir: string }
   const raw = getRouterParam(event, '_') ?? ''
   let key: string
   try {
      key = decodeURIComponent(raw)
   } catch {
      notFound()
   }
   if (isMediaFolderMarker(key)) notFound()

   const path = mediaFilePath(dir, key)
   if (!path) notFound()
   const info = await stat(path).catch(() => null)
   if (!info?.isFile()) notFound()

   const mime = await mimeFor(key)
   const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`
   setResponseHeaders(event, {
      'content-type': mime ?? 'application/octet-stream',
      ...(mime ? {} : { 'content-disposition': 'attachment' }),
      'cache-control': IMMUTABLE,
      'last-modified': info.mtime.toUTCString(),
      etag,
      'accept-ranges': 'bytes',
      'x-content-type-options': 'nosniff',
   })

   if (getRequestHeader(event, 'if-none-match') === etag) {
      setResponseStatus(event, 304)
      return null
   }

   const range = parseByteRange(getRequestHeader(event, 'range'), info.size)
   if (range === 'unsatisfiable') {
      setResponseHeaders(event, { 'content-range': `bytes */${info.size}` })
      throw createError({ statusCode: 416, statusMessage: 'Range not satisfiable' })
   }
   if (range) {
      setResponseStatus(event, 206)
      setResponseHeaders(event, {
         'content-range': `bytes ${range.start}-${range.end}/${info.size}`,
         'content-length': range.end - range.start + 1,
      })
      if (event.method === 'HEAD') return endWithoutBody(event)
      return sendStream(event, createReadStream(path, { start: range.start, end: range.end }))
   }

   setResponseHeaders(event, { 'content-length': info.size })
   if (event.method === 'HEAD') return endWithoutBody(event)
   return sendStream(event, createReadStream(path))
})
