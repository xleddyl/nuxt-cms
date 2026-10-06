import type { H3Event } from 'h3'
import { AwsClient } from 'aws4fetch'
import { createError } from 'h3'
import { useRuntimeConfig } from '#imports'
import type { MediaItem, MediaStorageMode } from '../../shared/index'
import { formatFileSize, mediaPublicUrl, mediaTypeFor } from '../../shared/index'
import { normalizeTimestamp } from '../../shared/timestamps'
import { removeMediaFile, writeMediaFile } from './media-fs'

interface MediaConfig {
   storage: MediaStorageMode
   endpoint: string
   region: string
   bucket: string
   presignExpiry: number
   maxFileSize: number
   accessKeyId: string
   secretAccessKey: string
   dir?: string
}

export interface MediaUploadTarget {
   url: string
   headers: Record<string, string>
}

export interface MediaStore {
   uploadTarget: (key: string, contentType: string, size: number) => Promise<MediaUploadTarget>
   write: (key: string, body: Uint8Array<ArrayBuffer>, contentType: string) => Promise<void>
   remove: (key: string) => Promise<void>
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

export function baseContentType(contentType: string) {
   return contentType.split(';')[0]!.trim().toLowerCase()
}

export function isAllowedUploadType(contentType: string) {
   const type = baseContentType(contentType)
   return (
      !UPLOAD_TYPE_BLOCKLIST.has(type) &&
      (UPLOAD_TYPES.has(type) || UPLOAD_TYPE_PREFIXES.some((prefix) => type.startsWith(prefix)))
   )
}

export function assertUploadContentType(contentType: string) {
   if (!isAllowedUploadType(contentType)) {
      throw createError({
         statusCode: 415,
         statusMessage: `Unsupported content type: ${contentType}`,
      })
   }
}

export function assertUploadSize(size: number, maxFileSize: number) {
   if (size > maxFileSize) {
      throw createError({
         statusCode: 413,
         statusMessage: `File exceeds the maximum size of ${formatFileSize(maxFileSize)}`,
      })
   }
}

export function encodeKey(key: string) {
   return key.split('/').map(encodeURIComponent).join('/')
}

export function assertMediaConfigured(media: MediaConfig) {
   if (media.storage === 'filesystem') {
      if (!media.dir) {
         throw createError({
            statusCode: 501,
            statusMessage: 'Media storage is not configured (cms.media.dir in nuxt.config)',
         })
      }
      return
   }
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

export function mediaUploadPath(key: string) {
   return `/api/cms/admin/media/upload?key=${encodeURIComponent(key)}`
}

function filesystemStore(dir: string): MediaStore {
   return {
      uploadTarget: async (key, contentType) => ({
         url: mediaUploadPath(key),
         headers: { 'content-type': contentType },
      }),
      write: (key, body) => writeMediaFile(dir, key, body, Math.max(body.byteLength, 1)),
      remove: (key) => removeMediaFile(dir, key),
   }
}

function s3Store(media: MediaConfig): MediaStore {
   const client = new AwsClient({
      accessKeyId: media.accessKeyId,
      secretAccessKey: media.secretAccessKey,
      region: media.region,
      service: 's3',
   })
   const bucketUrl = `${media.endpoint.replace(/\/+$/, '')}/${media.bucket}`

   return {
      async uploadTarget(key, contentType, size) {
         const url = new URL(`${bucketUrl}/${key}`)
         url.searchParams.set('X-Amz-Expires', String(media.presignExpiry))
         const signed = await client.sign(
            new Request(url, {
               method: 'PUT',
               headers: { 'content-type': contentType, 'content-length': String(size) },
            }),
            { aws: { signQuery: true, allHeaders: true } }
         )
         return { url: signed.url, headers: { 'content-type': contentType } }
      },
      async write(key, body, contentType) {
         const res = await client.fetch(`${bucketUrl}/${encodeKey(key)}`, {
            method: 'PUT',
            body,
            headers: { 'content-type': contentType, 'content-length': String(body.byteLength) },
         })
         if (!res.ok) {
            throw createError({
               statusCode: 502,
               statusMessage: `Bucket write failed (${res.status})`,
            })
         }
      },
      async remove(key) {
         const res = await client.fetch(`${bucketUrl}/${encodeKey(key)}`, { method: 'DELETE' })
         if (!res.ok && res.status !== 404) {
            throw createError({
               statusCode: 502,
               statusMessage: `Bucket delete failed (${res.status})`,
            })
         }
      },
   }
}

export function useMediaStorage(event: H3Event) {
   const { media, publicUrl } = useMediaConfig(event)
   assertMediaWritable(media)
   const store = media.storage === 'filesystem' ? filesystemStore(media.dir!) : s3Store(media)
   return { media, store, publicUrl }
}

export function toMediaItem(
   row: Omit<MediaItem, 'type' | 'url'>,
   publicUrl: (key: string) => string | null
): MediaItem {
   return {
      ...row,
      createdAt: normalizeTimestamp(row.createdAt),
      type: mediaTypeFor(row.mime, row.key),
      url: publicUrl(row.key),
   }
}
