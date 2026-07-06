import { randomUUID } from 'node:crypto'
import { createError, defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { slugify } from '../../shared/index'
import { assertUploadContentType, useMediaStorage } from '../utils/media'
import { requireAdmin } from '../utils/require-admin'

const MAX_BASE_LENGTH = 80
const MAX_EXT_LENGTH = 10
const MAX_FILE_SIZE = 10 * 1024 * 1024

const bodySchema = z.object({
   filename: z.string().trim().min(1).max(255),
   contentType: z.string().regex(/^[-\w.+]+\/[-\w.+]+$/, 'Invalid content type'),
   size: z.number().int().positive(),
})

function slugifyFilename(filename: string) {
   const dot = filename.lastIndexOf('.')
   const base =
      slugify(dot > 0 ? filename.slice(0, dot) : filename).slice(0, MAX_BASE_LENGTH) || 'file'
   const ext =
      dot > 0
         ? filename
              .slice(dot + 1)
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '')
              .slice(0, MAX_EXT_LENGTH)
         : ''
   return ext ? `${base}.${ext}` : base
}

export default defineEventHandler(async (event) => {
   await requireAdmin(event)
   const { media, client, bucketUrl, publicUrl } = useMediaStorage(event)

   const { filename, contentType, size } = await readValidatedBody(event, bodySchema.parse)
   assertUploadContentType(contentType)
   if (size > MAX_FILE_SIZE) {
      throw createError({
         statusCode: 413,
         statusMessage: 'File exceeds the maximum size of 10 MB',
      })
   }

   const now = new Date()
   const prefix = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`
   const key = `${prefix}/${randomUUID()}-${slugifyFilename(filename)}`

   const url = new URL(`${bucketUrl}/${key}`)
   url.searchParams.set('X-Amz-Expires', String(media.presignExpiry))
   const signed = await client.sign(
      new Request(url, {
         method: 'PUT',
         headers: { 'content-type': contentType, 'content-length': String(size) },
      }),
      { aws: { signQuery: true, allHeaders: true } }
   )

   return {
      key,
      uploadUrl: signed.url,
      method: 'PUT',
      headers: { 'content-type': contentType },
      publicUrl: publicUrl(key),
      expiresIn: media.presignExpiry,
   }
})
