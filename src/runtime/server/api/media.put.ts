import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { useDb } from '#cms-db'
import { cms_media } from '#cms-tables'
import type { MediaItem } from '../../shared/index'
import { toMediaItem, useMediaConfig } from '../utils/media'
import { requireAdmin } from '../utils/require-admin'

const bodySchema = z.object({
   id: z.number().int().positive(),
   alt: z.string().max(1024).nullish(),
   folder: z.string().max(255).nullish(),
})

export default defineEventHandler(async (event): Promise<MediaItem> => {
   await requireAdmin(event)
   const { publicUrl } = useMediaConfig(event)
   const body = await readValidatedBody(event, bodySchema.parse)

   const updates: { alt?: string | null; folder?: string | null } = {}
   if (body.alt !== undefined) updates.alt = body.alt
   if (body.folder !== undefined) updates.folder = body.folder
   if (Object.keys(updates).length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
   }

   const [row] = await useDb()
      .update(cms_media)
      .set(updates)
      .where(eq(cms_media.id, body.id))
      .returning()

   if (!row) {
      throw createError({ statusCode: 404, statusMessage: 'Media not found' })
   }

   return toMediaItem(row, publicUrl)
})
