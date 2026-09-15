import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
   gifImageSize,
   imageSizeFromBuffer,
   isSyncableMediaKey,
   jpegImageSize,
   matroskaVideoSize,
   mediaMimeForKey,
   mediaSyncFolder,
   mp4VideoSize,
   pngImageSize,
   readMediaFileMeta,
   scanMediaDirectory,
   videoSizeFromBuffer,
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

function box(type: string, payload: Uint8Array) {
   return bytes(uint32be(payload.length + 8), type, payload)
}

function tkhd(width: number, height: number, rotated = false) {
   const matrix = new Uint8Array(36)
   const entries = new DataView(matrix.buffer)
   if (rotated) {
      entries.setInt32(4, 0x10000)
      entries.setInt32(8, -0x10000)
   } else {
      entries.setInt32(0, 0x10000)
      entries.setInt32(16, 0x10000)
   }
   return box(
      'tkhd',
      bytes(
         new Uint8Array(4),
         new Uint8Array(20),
         new Uint8Array(16),
         matrix,
         uint32be(width * 0x10000),
         uint32be(height * 0x10000)
      )
   )
}

function moov(...traks: Uint8Array[]) {
   return box('moov', bytes(...traks.map((trak) => box('trak', trak))))
}

function mp4(width: number, height: number, rotated = false) {
   return bytes(
      box('ftyp', bytes('isom', new Uint8Array(4), 'isomavc1')),
      moov(tkhd(width, height, rotated))
   )
}

function mp4MoovLast(width: number, height: number, padding: number) {
   return bytes(
      box('ftyp', bytes('isom', new Uint8Array(4))),
      box('mdat', new Uint8Array(padding)),
      moov(tkhd(width, height))
   )
}

function ebmlSize(length: number) {
   if (length < 0x7f) return Uint8Array.of(0x80 | length)
   return Uint8Array.of(0x40 | ((length >> 8) & 0x3f), length & 0xff)
}

function ebml(id: Uint8Array, payload: Uint8Array) {
   return bytes(id, ebmlSize(payload.length), payload)
}

function ebmlUint(id: Uint8Array, value: number) {
   return ebml(id, uint16be(value))
}

const EBML_HEADER = Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3)
const SEGMENT = Uint8Array.of(0x18, 0x53, 0x80, 0x67)
const TRACKS = Uint8Array.of(0x16, 0x54, 0xae, 0x6b)
const TRACK_ENTRY = Uint8Array.of(0xae)
const VIDEO = Uint8Array.of(0xe0)
const PIXEL_WIDTH = Uint8Array.of(0xb0)
const PIXEL_HEIGHT = Uint8Array.of(0xba)
const DISPLAY_WIDTH = Uint8Array.of(0x54, 0xb0)
const DISPLAY_HEIGHT = Uint8Array.of(0x54, 0xba)

function webm(video: Uint8Array) {
   return bytes(
      ebml(EBML_HEADER, bytes('matroska')),
      ebml(SEGMENT, ebml(TRACKS, ebml(TRACK_ENTRY, ebml(VIDEO, video))))
   )
}

function webmPixels(width: number, height: number) {
   return webm(bytes(ebmlUint(PIXEL_WIDTH, width), ebmlUint(PIXEL_HEIGHT, height)))
}

function webmDisplay(width: number, height: number, displayWidth: number, displayHeight: number) {
   return webm(
      bytes(
         ebmlUint(PIXEL_WIDTH, width),
         ebmlUint(PIXEL_HEIGHT, height),
         ebmlUint(DISPLAY_WIDTH, displayWidth),
         ebmlUint(DISPLAY_HEIGHT, displayHeight)
      )
   )
}

describe('video dimension parsers', () => {
   it('reads mp4 track dimensions', () => {
      expect(mp4VideoSize(mp4(1920, 1080))).toEqual({ width: 1920, height: 1080 })
      expect(videoSizeFromBuffer(mp4(640, 360))).toEqual({ width: 640, height: 360 })
   })

   it('swaps mp4 dimensions on a quarter turn matrix', () => {
      expect(mp4VideoSize(mp4(1920, 1080, true))).toEqual({ width: 1080, height: 1920 })
   })

   it('skips mp4 tracks without dimensions', () => {
      const withAudioFirst = bytes(
         box('ftyp', bytes('isom', new Uint8Array(4))),
         moov(tkhd(0, 0), tkhd(720, 1280))
      )
      expect(mp4VideoSize(withAudioFirst)).toEqual({ width: 720, height: 1280 })
   })

   it('reads matroska pixel and display dimensions', () => {
      expect(matroskaVideoSize(webmPixels(1280, 720))).toEqual({ width: 1280, height: 720 })
      expect(matroskaVideoSize(webmDisplay(1280, 720, 640, 480))).toEqual({
         width: 640,
         height: 480,
      })
      expect(videoSizeFromBuffer(webmPixels(24, 42))).toEqual({ width: 24, height: 42 })
   })

   it('returns null for non-video, truncated or unknown containers', () => {
      expect(videoSizeFromBuffer(new Uint8Array(0))).toBeNull()
      expect(videoSizeFromBuffer(png(2, 2))).toBeNull()
      expect(mp4VideoSize(webmPixels(2, 2))).toBeNull()
      expect(matroskaVideoSize(mp4(2, 2))).toBeNull()
      expect(mp4VideoSize(mp4(2, 2).subarray(0, 20))).toBeNull()
      expect(mp4VideoSize(box('ftyp', bytes('isom', new Uint8Array(4))))).toBeNull()
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
      await writeFile(join(root, 'clip.mp4'), mp4(1920, 1080))
      await writeFile(join(root, 'tail.mp4'), mp4MoovLast(720, 1280, 200_000))
      await writeFile(join(root, 'loop.webm'), webmPixels(1280, 720))
   })

   afterAll(async () => {
      await rm(root, { recursive: true, force: true })
   })

   it('walks recursively and returns posix keys with sizes', async () => {
      const files = await scanMediaDirectory(root)
      expect(files.map((file) => file.key)).toEqual([
         'brochure.pdf',
         'clip.mp4',
         'hero.png',
         'loop.webm',
         'tail.mp4',
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

   it('reads dimensions for videos, including a moov box past the header window', async () => {
      const files = await scanMediaDirectory(root)
      const meta = async (key: string) =>
         readMediaFileMeta(root, files.find((file) => file.key === key)!)

      expect(await meta('clip.mp4')).toMatchObject({
         mime: 'video/mp4',
         width: 1920,
         height: 1080,
      })
      expect(await meta('tail.mp4')).toMatchObject({
         mime: 'video/mp4',
         width: 720,
         height: 1280,
      })
      expect(await meta('loop.webm')).toMatchObject({
         mime: 'video/webm',
         width: 1280,
         height: 720,
      })
   })
})
