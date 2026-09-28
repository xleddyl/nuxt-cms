import { createError, defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { normalizeMediaFolder } from '../../shared/index'
import { useMediaStorage } from '../utils/media'
import { writeMediaFolderMarker } from '../utils/media-folders'
import { requireAdmin } from '../utils/require-admin'

const bodySchema = z.object({ name: z.string().min(1).max(255) })

export default defineEventHandler(async (event) => {
   await requireAdmin(event)
   const { store } = useMediaStorage(event)
   const { name } = await readValidatedBody(event, bodySchema.parse)

   const folder = normalizeMediaFolder(name)
   if (!folder) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid folder name' })
   }

   await writeMediaFolderMarker(store, folder)

   return { folder }
})
