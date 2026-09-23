import { inArray, like, or } from 'drizzle-orm'
import { createError, defineEventHandler, getValidatedQuery } from 'h3'
import { z } from 'zod'
import { useDb } from '#cms-db'
import { cms_media } from '#cms-tables'
import { isMediaFolderMarker, normalizeMediaFolder } from '../../shared/index'
import { useMediaStorage } from '../utils/media'
import { requireAdmin } from '../utils/require-admin'

const querySchema = z.object({
   name: z.string().min(1).max(255),
   recursive: z.stringbool().default(false),
})

export default defineEventHandler(async (event) => {
   await requireAdmin(event)
   const { store } = useMediaStorage(event)
   const { name, recursive } = await getValidatedQuery(event, querySchema.parse)

   const folder = normalizeMediaFolder(name)
   if (!folder) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid folder name' })
   }

   const db = useDb()
   const rows = await db
      .select({ key: cms_media.key })
      .from(cms_media)
      .where(or(like(cms_media.folder, `${folder}/%`), like(cms_media.folder, folder)))

   const files = rows.filter((row) => !isMediaFolderMarker(row.key))
   if (files.length && !recursive) {
      throw createError({
         statusCode: 409,
         statusMessage: `The folder holds ${files.length} file${files.length > 1 ? 's' : ''}`,
      })
   }

   for (const row of rows) {
      await store.remove(row.key)
   }

   if (rows.length) {
      await db.delete(cms_media).where(
         inArray(
            cms_media.key,
            rows.map((row) => row.key)
         )
      )
   }

   return { deleted: rows.length }
})
