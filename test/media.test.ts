import { describe, expect, it } from 'vitest'
import {
   assertMediaConfigured,
   assertMediaWritable,
   assertUploadContentType,
} from '../src/runtime/server/utils/media'

function s3Media(overrides: Partial<Parameters<typeof assertMediaConfigured>[0]> = {}) {
   return {
      storage: 's3' as const,
      endpoint: 'https://example.r2.cloudflarestorage.com',
      region: 'auto',
      bucket: 'bucket',
      presignExpiry: 600,
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
