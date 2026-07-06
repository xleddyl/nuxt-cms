import { describe, expect, it } from 'vitest'
import { assertUploadContentType } from '../src/runtime/server/utils/media'

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
