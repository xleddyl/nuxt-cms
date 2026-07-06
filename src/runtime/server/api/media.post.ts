import { defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { useDb } from '#cms-db'
import { cms_media } from '#cms-tables'
import type { MediaItem } from '../../shared/index'
import { objectKeySchema } from '../../shared/validation'
import { assertUploadContentType, toMediaItem, useMediaConfig } from '../utils/media'
import { requireAdmin } from '../utils/require-admin'

const bodySchema = z.object({
   key: objectKeySchema,
   mime: z.string().max(255).nullish(),
   size: z.number().int().nonnegative().nullish(),
   width: z.number().int().positive().nullish(),
   height: z.number().int().positive().nullish(),
   alt: z.string().max(1024).nullish(),
   folder: z.string().max(255).nullish(),
})

export default defineEventHandler(async (event): Promise<MediaItem> => {
   await requireAdmin(event)
   const { publicUrl } = useMediaConfig(event)
   const body = await readValidatedBody(event, bodySchema.parse)
   if (body.mime) assertUploadContentType(body.mime)

   const values = {
      key: body.key,
      mime: body.mime ?? null,
      size: body.size ?? null,
      width: body.width ?? null,
      height: body.height ?? null,
      alt: body.alt ?? null,
      folder: body.folder ?? null,
   }

   const [row] = await useDb()
      .insert(cms_media)
      .values(values)
      .onConflictDoUpdate({ target: cms_media.key, set: values })
      .returning()

   return toMediaItem(row!, publicUrl)
})
