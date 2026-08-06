import { describe, expect, it } from 'vitest'
import {
   assertMediaConfigured,
   assertMediaWritable,
   assertUploadContentType,
   assertUploadSize,
} from '../src/runtime/server/utils/media'
import { DEFAULT_MEDIA_MAX_FILE_SIZE, formatFileSize } from '../src/runtime/shared/index'

function s3Media(overrides: Partial<Parameters<typeof assertMediaConfigured>[0]> = {}) {
   return {
      storage: 's3' as const,
      endpoint: 'https://example.r2.cloudflarestorage.com',
      region: 'auto',
      bucket: 'bucket',
      presignExpiry: 600,
      maxFileSize: DEFAULT_MEDIA_MAX_FILE_SIZE,
      accessKeyId: 'id',
      secretAccessKey: 'secret',
      ...overrides,
   }
}

describe('assertUploadContentType', () => {
   it.each([
      'image/png',
      'image/jpeg',
      'video/mp4',
      'audio/mpeg',
      'font/woff2',
      'application/pdf',
      'text/plain',
   ])('allows %s', (type) => {
      expect(() => assertUploadContentType(type)).not.toThrow()
   })

   it.each([
      'image/svg+xml',
      'text/html',
      'application/xhtml+xml',
      'text/javascript',
      'application/octet-stream',
   ])('rejects %s', (type) => {
      expect(() => assertUploadContentType(type)).toThrow()
   })

   it('is case-insensitive', () => {
      expect(() => assertUploadContentType('IMAGE/PNG')).not.toThrow()
      expect(() => assertUploadContentType('Image/SVG+XML')).toThrow()
   })
})

describe('assertMediaConfigured', () => {
   it('throws 501 when s3 storage is missing credentials', () => {
      expect(() => assertMediaConfigured(s3Media({ bucket: '' }))).toThrow(
         expect.objectContaining({ statusCode: 501 })
      )
      expect(() => assertMediaConfigured(s3Media({ accessKeyId: '' }))).toThrow(
         expect.objectContaining({ statusCode: 501 })
      )
   })

   it('does not throw when s3 storage is fully configured', () => {
      expect(() => assertMediaConfigured(s3Media())).not.toThrow()
   })

   it('never throws for local storage, even without any s3 fields set', () => {
      expect(() =>
         assertMediaConfigured({
            storage: 'local',
            endpoint: '',
            region: '',
            bucket: '',
            presignExpiry: 600,
            maxFileSize: DEFAULT_MEDIA_MAX_FILE_SIZE,
            accessKeyId: '',
            secretAccessKey: '',
         })
      ).not.toThrow()
   })
})

describe('assertMediaWritable', () => {
   it('throws 501 for local storage', () => {
      expect(() => assertMediaWritable(s3Media({ storage: 'local' }))).toThrow(
         expect.objectContaining({
            statusCode: 501,
            statusMessage: expect.stringContaining('read-only'),
         })
      )
   })

   it('does not throw for s3 storage', () => {
      expect(() => assertMediaWritable(s3Media())).not.toThrow()
   })
})

describe('formatFileSize', () => {
   it.each([
      [0, '0 B'],
      [512, '512 B'],
      [1024, '1 KB'],
      [DEFAULT_MEDIA_MAX_FILE_SIZE, '10 MB'],
      [50 * 1024 * 1024, '50 MB'],
      [2 * 1024 * 1024 * 1024, '2 GB'],
   ])('formats %i as %s', (bytes, expected) => {
      expect(formatFileSize(bytes)).toBe(expected)
   })
})

describe('assertUploadSize', () => {
   it('accepts a file at or below the default cap', () => {
      expect(() => assertUploadSize(1024, DEFAULT_MEDIA_MAX_FILE_SIZE)).not.toThrow()
      expect(() =>
         assertUploadSize(DEFAULT_MEDIA_MAX_FILE_SIZE, DEFAULT_MEDIA_MAX_FILE_SIZE)
      ).not.toThrow()
   })

   it('throws 413 above the default cap', () => {
      expect(() =>
         assertUploadSize(DEFAULT_MEDIA_MAX_FILE_SIZE + 1, DEFAULT_MEDIA_MAX_FILE_SIZE)
      ).toThrow(expect.objectContaining({ statusCode: 413 }))
   })

   it('honours a custom cap', () => {
      const cap = 50 * 1024 * 1024
      expect(() => assertUploadSize(DEFAULT_MEDIA_MAX_FILE_SIZE + 1, cap)).not.toThrow()
      expect(() => assertUploadSize(cap, cap)).not.toThrow()
      expect(() => assertUploadSize(cap + 1, cap)).toThrow(
         expect.objectContaining({ statusCode: 413 })
      )
   })

   it('reports the configured cap in the error message', () => {
      expect(() => assertUploadSize(2, 1)).toThrow(/maximum size of 1 B/)
      expect(() => assertUploadSize(60 * 1024 * 1024, 50 * 1024 * 1024)).toThrow(
         /maximum size of 50 MB/
      )
   })
})
