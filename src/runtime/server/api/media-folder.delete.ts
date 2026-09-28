import { createError, defineEventHandler, getValidatedQuery } from 'h3'
import { z } from 'zod'
import { isMediaFolderMarker, normalizeMediaFolder } from '../../shared/index'
import { useMediaStorage } from '../utils/media'
import { deleteMediaRows, mediaRowsInFolder } from '../utils/media-folders'
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

   const rows = await mediaRowsInFolder(folder)

   const files = rows.filter((row) => !isMediaFolderMarker(row.key))
   if (files.length && !recursive) {
      throw createError({
         statusCode: 409,
         statusMessage: `The folder holds ${files.length} file${files.length > 1 ? 's' : ''}`,
      })
   }

   await deleteMediaRows(
      store,
      rows.map((row) => row.key)
   )

   return { deleted: rows.length }
})
