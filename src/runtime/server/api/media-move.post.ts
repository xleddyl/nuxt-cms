import { and, inArray, not, like } from 'drizzle-orm'
import { defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { runBatch } from '#cms-db'
import { cms_media } from '#cms-tables'
import { MEDIA_FOLDER_MARKER, normalizeMediaFolder } from '../../shared/index'
import { objectKeySchema } from '../../shared/validation'
import { useMediaStorage } from '../utils/media'
import { keyChunks } from '../utils/media-folders'
import { requireAdmin } from '../utils/require-admin'

const bodySchema = z.object({
   keys: z.array(objectKeySchema).min(1).max(1000),
   folder: z.string().max(255).nullable(),
})

export default defineEventHandler(async (event) => {
   await requireAdmin(event)
   useMediaStorage(event)
   const { keys, folder } = await readValidatedBody(event, bodySchema.parse)
   const target = normalizeMediaFolder(folder)

   const results = await runBatch((db) =>
      keyChunks([...new Set(keys)]).map((chunk) =>
         db
            .update(cms_media)
            .set({ folder: target })
            .where(
               and(
                  inArray(cms_media.key, chunk),
                  not(like(cms_media.key, `%/${MEDIA_FOLDER_MARKER}`))
               )
            )
            .returning({ key: cms_media.key })
      )
   )
   const moved = (results as unknown[][]).reduce((total, rows) => total + rows.length, 0)

   return { folder: target, moved }
})
