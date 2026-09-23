import { existsSync } from 'node:fs'
import {
   createError,
   defineEventHandler,
   getRequestHeader,
   getRequestWebStream,
   getValidatedQuery,
   sendNoContent,
} from 'h3'
import { z } from 'zod'
import { isMediaFolderMarker } from '../../shared/index'
import { objectKeySchema } from '../../shared/validation'
import { requireMediaFilePath, writeMediaFile } from '../utils/media-fs'
import { assertUploadContentType, assertUploadSize, useMediaStorage } from '../utils/media'
import { requireAdmin } from '../utils/require-admin'

const querySchema = z.object({ key: objectKeySchema })

export default defineEventHandler(async (event) => {
   await requireAdmin(event)
   const { media } = useMediaStorage(event)
   if (media.storage !== 'filesystem') {
      throw createError({
         statusCode: 501,
         statusMessage: 'Direct uploads are only available with filesystem media storage',
      })
   }

   const { key } = await getValidatedQuery(event, querySchema.parse)
   if (isMediaFolderMarker(key)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid object key' })
   }
   assertUploadContentType(getRequestHeader(event, 'content-type') ?? '')
   const declaredSize = Number(getRequestHeader(event, 'content-length'))
   if (Number.isFinite(declaredSize)) assertUploadSize(declaredSize, media.maxFileSize)

   if (existsSync(requireMediaFilePath(media.dir!, key))) {
      throw createError({ statusCode: 409, statusMessage: 'A file with this key already exists' })
   }

   const body = getRequestWebStream(event)
   if (!body) {
      throw createError({ statusCode: 400, statusMessage: 'Empty upload' })
   }
   await writeMediaFile(media.dir!, key, body, media.maxFileSize)

   return sendNoContent(event, 201)
})
