import { inArray } from 'drizzle-orm'
import { defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { useDb } from '#cms-db'
import { cms_media } from '#cms-tables'
import { isMediaFolderMarker } from '../../shared/index'
import { objectKeySchema } from '../../shared/validation'
import { useMediaStorage } from '../utils/media'
import { deleteMediaRows, keyChunks } from '../utils/media-folders'
import { requireAdmin } from '../utils/require-admin'

const bodySchema = z.object({ keys: z.array(objectKeySchema).min(1).max(1000) })

export default defineEventHandler(async (event) => {
   await requireAdmin(event)
   const { store } = useMediaStorage(event)
   const { keys } = await readValidatedBody(event, bodySchema.parse)

   const found: string[] = []
   for (const chunk of keyChunks([...new Set(keys)])) {
      const rows = await useDb()
         .select({ key: cms_media.key })
         .from(cms_media)
         .where(inArray(cms_media.key, chunk))
      found.push(...rows.map((row) => row.key).filter((key) => !isMediaFolderMarker(key)))
   }

   await deleteMediaRows(store, found)

   return { deleted: found.length }
})
