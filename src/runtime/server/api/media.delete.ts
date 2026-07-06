import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, getValidatedQuery } from 'h3'
import { z } from 'zod'
import { useDb } from '#cms-db'
import { cms_media } from '#cms-tables'
import { objectKeySchema } from '../../shared/validation'
import { encodeKey, useMediaStorage } from '../utils/media'
import { requireAdmin } from '../utils/require-admin'

const querySchema = z.object({ key: objectKeySchema })

export default defineEventHandler(async (event) => {
   await requireAdmin(event)
   const { client, bucketUrl } = useMediaStorage(event)
   const { key } = await getValidatedQuery(event, querySchema.parse)

   const db = useDb()
   const [row] = await db.select().from(cms_media).where(eq(cms_media.key, key)).limit(1)
   if (!row) {
      throw createError({ statusCode: 404, statusMessage: 'Media not found' })
   }

   const res = await client.fetch(`${bucketUrl}/${encodeKey(key)}`, { method: 'DELETE' })
   if (!res.ok && res.status !== 404) {
      throw createError({ statusCode: 502, statusMessage: `Bucket delete failed (${res.status})` })
   }

   await db.delete(cms_media).where(eq(cms_media.key, key))

   return { ok: true }
})
