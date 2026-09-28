import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { useDb } from '#cms-db'
import { cms_media } from '#cms-tables'
import {
   isMediaFolderMarker,
   isWithinMediaFolder,
   MEDIA_FOLDER_MAX_DEPTH,
   mediaFolderDepth,
   mediaFolderSegments,
   normalizeMediaFolder,
   rebaseMediaFolder,
} from '../../shared/index'
import { useMediaStorage } from '../utils/media'
import { mediaRowsInFolder, writeMediaFolderMarker } from '../utils/media-folders'
import { requireAdmin } from '../utils/require-admin'

const bodySchema = z.object({
   from: z.string().min(1).max(255),
   to: z.string().min(1).max(255),
})

function tooDeep() {
   return createError({
      statusCode: 400,
      statusMessage: `Folders can be nested at most ${MEDIA_FOLDER_MAX_DEPTH} levels deep`,
   })
}

export default defineEventHandler(async (event) => {
   await requireAdmin(event)
   const { store } = useMediaStorage(event)
   const body = await readValidatedBody(event, bodySchema.parse)

   const from = normalizeMediaFolder(body.from)
   const to = normalizeMediaFolder(body.to)
   if (!from || !to) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid folder name' })
   }
   if (mediaFolderSegments(body.to).length > MEDIA_FOLDER_MAX_DEPTH) throw tooDeep()
   if (from === to) return { folder: to, moved: 0 }
   if (isWithinMediaFolder(to, from)) {
      throw createError({
         statusCode: 400,
         statusMessage: 'A folder cannot be moved inside itself',
      })
   }

   const rows = await mediaRowsInFolder(from)
   if (!rows.length) {
      throw createError({ statusCode: 404, statusMessage: 'Folder not found' })
   }

   const rebased = rows.map((row) => ({ ...row, target: rebaseMediaFolder(row.folder!, from, to) }))
   if (rebased.some((row) => mediaFolderDepth(row.target) > MEDIA_FOLDER_MAX_DEPTH)) {
      throw tooDeep()
   }

   const db = useDb()
   const fileFolders = new Map<string, string>()
   for (const row of rebased) {
      if (!isMediaFolderMarker(row.key)) fileFolders.set(row.folder!, row.target)
   }
   for (const [folder, target] of fileFolders) {
      await db.update(cms_media).set({ folder: target }).where(eq(cms_media.folder, folder))
   }

   for (const row of rebased) {
      if (!isMediaFolderMarker(row.key)) continue
      await writeMediaFolderMarker(store, row.target)
      await store.remove(row.key)
      await db.delete(cms_media).where(eq(cms_media.key, row.key))
   }

   return { folder: to, moved: rows.length }
})
