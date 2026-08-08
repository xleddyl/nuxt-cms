import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { useDb } from '#cms-db'
import { cms_media } from '#cms-tables'
import type { MediaItem } from '../../shared/index'
import { normalizeMediaFolder } from '../../shared/index'
import { useMediaIndex } from '../utils/media-index'
import { assertMediaWritable, toMediaItem, useMediaConfig } from '../utils/media'
import { requireAdmin } from '../utils/require-admin'

const bodySchema = z.object({
   key: z.string().min(1).max(1024),
   alt: z.string().max(1024).nullish(),
   folder: z.string().max(255).nullish(),
})

export default defineEventHandler(async (event): Promise<MediaItem> => {
   await requireAdmin(event)
   const { media, publicUrl } = useMediaConfig(event)
   const body = await readValidatedBody(event, bodySchema.parse)

   if (media.storage === 'local') {
      if (body.folder !== undefined) {
         throw createError({
            statusCode: 501,
            statusMessage: 'Media storage is local; the folder follows the file on disk',
         })
      }

      const file = (await useMediaIndex()).get(body.key)
      if (!file) {
         throw createError({ statusCode: 404, statusMessage: 'Media not found' })
      }

      const alt = body.alt ?? null
      await useDb()
         .insert(cms_media)
         .values({ key: body.key, alt })
         .onConflictDoUpdate({ target: cms_media.key, set: { alt } })

      return toMediaItem({ ...file, alt, createdAt: null }, publicUrl)
   }

   assertMediaWritable(media)

   const updates: { alt?: string | null; folder?: string | null } = {}
   if (body.alt !== undefined) updates.alt = body.alt
   if (body.folder !== undefined) updates.folder = normalizeMediaFolder(body.folder)
   if (Object.keys(updates).length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
   }

   const [row] = await useDb()
      .update(cms_media)
      .set(updates)
      .where(eq(cms_media.key, body.key))
      .returning()

   if (!row) {
      throw createError({ statusCode: 404, statusMessage: 'Media not found' })
   }

   return toMediaItem(row, publicUrl)
})
