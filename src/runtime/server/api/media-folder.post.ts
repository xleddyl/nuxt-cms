import { createError, defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { useDb } from '#cms-db'
import { cms_media } from '#cms-tables'
import { mediaFolderMarkerKey, normalizeMediaFolder } from '../../shared/index'
import { useMediaStorage } from '../utils/media'
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

   const key = mediaFolderMarkerKey(folder)
   await store.write(key, new Uint8Array(), 'application/x-empty')

   const values = {
      key,
      mime: 'application/x-empty',
      size: 0,
      width: null,
      height: null,
      alt: null,
      folder,
   }

   await useDb()
      .insert(cms_media)
      .values(values)
      .onConflictDoUpdate({ target: cms_media.key, set: values })

   return { folder }
})
