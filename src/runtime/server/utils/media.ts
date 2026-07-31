import type { H3Event } from 'h3'
import { AwsClient } from 'aws4fetch'
import { createError } from 'h3'
import { useRuntimeConfig } from '#imports'
import type { MediaItem, MediaStorageMode } from '../../shared/index'
import { mediaPublicUrl, mediaTypeFor } from '../../shared/index'

interface MediaConfig {
   storage: MediaStorageMode
   endpoint: string
   region: string
   bucket: string
   presignExpiry: number
   accessKeyId: string
   secretAccessKey: string
}

const UPLOAD_TYPE_PREFIXES = ['image/', 'video/', 'audio/', 'font/']
const UPLOAD_TYPE_BLOCKLIST = new Set(['image/svg+xml'])
const UPLOAD_TYPES = new Set([
   'application/pdf',
   'application/zip',
   'application/gzip',
   'application/json',
   'text/plain',
   'text/csv',
   'text/markdown',
   'application/msword',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'application/vnd.ms-excel',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'application/vnd.ms-powerpoint',
   'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

export function assertUploadContentType(contentType: string) {
   const type = contentType.toLowerCase()
   const allowed =
      !UPLOAD_TYPE_BLOCKLIST.has(type) &&
      (UPLOAD_TYPES.has(type) || UPLOAD_TYPE_PREFIXES.some((prefix) => type.startsWith(prefix)))
   if (!allowed) {
      throw createError({
         statusCode: 415,
         statusMessage: `Unsupported content type: ${contentType}`,
      })
   }
}

export function encodeKey(key: string) {
   return key.split('/').map(encodeURIComponent).join('/')
}

export function assertMediaConfigured(media: MediaConfig) {
   if (media.storage !== 's3') return
   if (!media.endpoint || !media.bucket || !media.accessKeyId || !media.secretAccessKey) {
      throw createError({
         statusCode: 501,
         statusMessage: 'Media storage is not configured (cms.media in nuxt.config)',
      })
   }
}

export function assertMediaWritable(media: MediaConfig) {
   if (media.storage === 'local') {
      throw createError({
         statusCode: 501,
         statusMessage: 'Media storage is local; the media library is read-only',
      })
   }
}

export function useMediaConfig(event: H3Event) {
   const config = useRuntimeConfig(event)
   const media = config.cms.media as MediaConfig
   assertMediaConfigured(media)
   const { mediaBaseUrl } = config.public.cms as { mediaBaseUrl: string }
   const publicUrl = (key: string) => mediaPublicUrl(mediaBaseUrl, key)
   return { media, publicUrl }
}

export function useMediaStorage(event: H3Event) {
   const { media, publicUrl } = useMediaConfig(event)
   assertMediaWritable(media)

   const client = new AwsClient({
      accessKeyId: media.accessKeyId,
      secretAccessKey: media.secretAccessKey,
      region: media.region,
      service: 's3',
   })

   const bucketUrl = `${media.endpoint.replace(/\/+$/, '')}/${media.bucket}`

   return { media, client, bucketUrl, publicUrl }
}

export function toMediaItem(
   row: Omit<MediaItem, 'type' | 'url'>,
   publicUrl: (key: string) => string | null
): MediaItem {
   return {
      ...row,
      type: mediaTypeFor(row.mime, row.key),
      url: publicUrl(row.key),
   }
}
