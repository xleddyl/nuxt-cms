import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
   gifImageSize,
   imageSizeFromBuffer,
   isSyncableMediaKey,
   jpegImageSize,
   mediaMimeForKey,
   mediaSyncFolder,
   pngImageSize,
   readMediaFileMeta,
   scanMediaDirectory,
   webpImageSize,
} from '../src/runtime/server/utils/media-sync'

function bytes(...values: (number | string | Uint8Array)[]): Uint8Array {
   const parts = values.map((value) =>
      typeof value === 'number'
         ? Uint8Array.of(value)
         : typeof value === 'string'
           ? Uint8Array.from(value, (char) => char.charCodeAt(0))
           : value
   )
   const total = parts.reduce((sum, part) => sum + part.length, 0)
   const out = new Uint8Array(total)
   let offset = 0
   for (const part of parts) {
      out.set(part, offset)
      offset += part.length
   }
   return out
}

function uint16be(value: number) {
   return Uint8Array.of((value >> 8) & 0xff, value & 0xff)
}

function uint16le(value: number) {
   return Uint8Array.of(value & 0xff, (value >> 8) & 0xff)
}

function uint24le(value: number) {
   return Uint8Array.of(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff)
}

function uint32be(value: number) {
   return Uint8Array.of(
      (value >>> 24) & 0xff,
      (value >> 16) & 0xff,
      (value >> 8) & 0xff,
      value & 0xff
   )
}

function uint32le(value: number) {
   return Uint8Array.of(
      value & 0xff,
      (value >> 8) & 0xff,
      (value >> 16) & 0xff,
      (value >>> 24) & 0xff
   )
}

function png(width: number, height: number) {
   return bytes(
      Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
      uint32be(13),
      'IHDR',
      uint32be(width),
      uint32be(height),
      Uint8Array.of(8, 6, 0, 0, 0),
      uint32be(0)
   )
}

function jpeg(width: number, height: number, marker = 0xc0) {
   return bytes(
      Uint8Array.of(0xff, 0xd8),
      Uint8Array.of(0xff, 0xe0),
      uint16be(16),
      'JFIF\0',
      new Uint8Array(11),
      Uint8Array.of(0xff, 0xfe),
      uint16be(6),
      'test',
      Uint8Array.of(0xff, marker),
      uint16be(17),
      Uint8Array.of(8),
      uint16be(height),
      uint16be(width),
      Uint8Array.of(3),
      new Uint8Array(9)
   )
}

function webpLossy(width: number, height: number) {
   const chunk = bytes(
      Uint8Array.of(0x00, 0x00, 0x00),
      Uint8Array.of(0x9d, 0x01, 0x2a),
      uint16le(width),
      uint16le(height)
   )
   return bytes('RIFF', uint32le(chunk.length + 12), 'WEBP', 'VP8 ', uint32le(chunk.length), chunk)
}

function webpLossless(width: number, height: number) {
   const bits = (width - 1) | ((height - 1) << 14)
   const chunk = bytes(Uint8Array.of(0x2f), uint32le(bits >>> 0))
   return bytes('RIFF', uint32le(chunk.length + 12), 'WEBP', 'VP8L', uint32le(chunk.length), chunk)
}

function webpExtended(width: number, height: number) {
   const chunk = bytes(new Uint8Array(4), uint24le(width - 1), uint24le(height - 1))
   return bytes('RIFF', uint32le(chunk.length + 12), 'WEBP', 'VP8X', uint32le(chunk.length), chunk)
}

function gif(width: number, height: number, version = '89a') {
   return bytes('GIF', version, uint16le(width), uint16le(height), Uint8Array.of(0xf7, 0x00, 0x00))
}

describe('image dimension parsers', () => {
   it('reads png dimensions', () => {
      expect(pngImageSize(png(1200, 630))).toEqual({ width: 1200, height: 630 })
      expect(imageSizeFromBuffer(png(4, 9))).toEqual({ width: 4, height: 9 })
   })

   it('reads jpeg dimensions from baseline and progressive frames', () => {
      expect(jpegImageSize(jpeg(800, 600))).toEqual({ width: 800, height: 600 })
      expect(jpegImageSize(jpeg(64, 48, 0xc2))).toEqual({ width: 64, height: 48 })
      expect(imageSizeFromBuffer(jpeg(1, 1))).toEqual({ width: 1, height: 1 })
   })

   it('reads webp dimensions for VP8, VP8L and VP8X', () => {
      expect(webpImageSize(webpLossy(320, 240))).toEqual({ width: 320, height: 240 })
      expect(webpImageSize(webpLossless(1024, 768))).toEqual({ width: 1024, height: 768 })
      expect(webpImageSize(webpExtended(5000, 4000))).toEqual({ width: 5000, height: 4000 })
      expect(imageSizeFromBuffer(webpLossy(16, 16))).toEqual({ width: 16, height: 16 })
   })

   it('reads gif dimensions for 87a and 89a', () => {
      expect(gifImageSize(gif(12, 34))).toEqual({ width: 12, height: 34 })
      expect(gifImageSize(gif(200, 100, '87a'))).toEqual({ width: 200, height: 100 })
      expect(imageSizeFromBuffer(gif(7, 7))).toEqual({ width: 7, height: 7 })
   })

   it('returns null for unknown, truncated or mismatched data', () => {
      expect(imageSizeFromBuffer(new Uint8Array(0))).toBeNull()
      expect(imageSizeFromBuffer(bytes('not an image at all'))).toBeNull()
      expect(pngImageSize(gif(2, 2))).toBeNull()
      expect(gifImageSize(png(2, 2))).toBeNull()
      expect(webpImageSize(bytes('RIFF', uint32le(4), 'WEBP', 'XXXX'))).toBeNull()
      expect(pngImageSize(png(3, 3).subarray(0, 20))).toBeNull()
      expect(jpegImageSize(jpeg(10, 10).subarray(0, 12))).toBeNull()
   })
})

describe('key helpers', () => {
   it.each(['photo.jpg', 'a/b/photo.JPEG', 'clip.mp4', 'song.mp3', 'doc.pdf', 'logo.svg'])(
      'accepts %s',
      (key) => {
         expect(isSyncableMediaKey(key)).toBe(true)
      }
   )

   it.each([
      '.gitkeep',
      'a/.DS_Store',
      'notes.txt',
      'archive.zip',
      'noextension',
      'a/b/.hidden.png',
   ])('skips %s', (key) => {
      expect(isSyncableMediaKey(key)).toBe(false)
   })

   it('maps extensions to mime types', () => {
      expect(mediaMimeForKey('a/b.webp')).toBe('image/webp')
      expect(mediaMimeForKey('a/b.MP4')).toBe('video/mp4')
      expect(mediaMimeForKey('a/b.txt')).toBeNull()
   })

   it('derives the folder from the key', () => {
      expect(mediaSyncFolder('hero.webp')).toBeNull()
      expect(mediaSyncFolder('waters/avisio-river.webp')).toBe('waters')
      expect(mediaSyncFolder('a/b/c.png')).toBe('a/b')
   })
})

describe('scanMediaDirectory', () => {
   let root: string

   beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), 'nuxt-cms-media-'))
      await mkdir(join(root, 'waters'), { recursive: true })
      await mkdir(join(root, '.hidden'), { recursive: true })
      await writeFile(join(root, 'hero.png'), png(120, 60))
      await writeFile(join(root, 'waters', 'river.webp'), webpLossy(320, 240))
      await writeFile(join(root, 'waters', 'notes.txt'), 'ignored')
      await writeFile(join(root, '.gitkeep'), '')
      await writeFile(join(root, '.hidden', 'secret.png'), png(1, 1))
      await writeFile(join(root, 'brochure.pdf'), '%PDF-1.4')
   })

   afterAll(async () => {
      await rm(root, { recursive: true, force: true })
   })

   it('walks recursively and returns posix keys with sizes', async () => {
      const files = await scanMediaDirectory(root)
      expect(files.map((file) => file.key)).toEqual([
         'brochure.pdf',
         'hero.png',
         'waters/river.webp',
      ])
      expect(files.every((file) => file.size > 0)).toBe(true)
   })

   it('reads metadata including dimensions for images', async () => {
      const [file] = await scanMediaDirectory(root).then((files) =>
         files.filter((file) => file.key === 'hero.png')
      )
      const meta = await readMediaFileMeta(root, file!)
      expect(meta).toMatchObject({
         key: 'hero.png',
         folder: null,
         mime: 'image/png',
         width: 120,
         height: 60,
      })
      expect(meta.size).toBe(file!.size)
   })

   it('reads metadata for nested files and leaves dimensions null for non-images', async () => {
      const files = await scanMediaDirectory(root)
      const webp = await readMediaFileMeta(root, files.find((f) => f.key.endsWith('.webp'))!)
      expect(webp).toMatchObject({
         folder: 'waters',
         mime: 'image/webp',
         width: 320,
         height: 240,
      })

      const pdf = await readMediaFileMeta(root, files.find((f) => f.key.endsWith('.pdf'))!)
      expect(pdf).toMatchObject({
         folder: null,
         mime: 'application/pdf',
         width: null,
         height: null,
      })
   })
})
