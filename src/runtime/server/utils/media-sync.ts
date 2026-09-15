import type { FileHandle } from 'node:fs/promises'
import { open, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export interface ScannedMediaFile {
   key: string
   size: number
}

export interface MediaFileMeta {
   key: string
   folder: string | null
   mime: string | null
   size: number
   width: number | null
   height: number | null
}

export interface ImageSize {
   width: number
   height: number
}

export const MEDIA_SYNC_MIME_TYPES: Record<string, string> = {
   jpg: 'image/jpeg',
   jpeg: 'image/jpeg',
   png: 'image/png',
   webp: 'image/webp',
   avif: 'image/avif',
   gif: 'image/gif',
   svg: 'image/svg+xml',
   mp4: 'video/mp4',
   m4v: 'video/x-m4v',
   webm: 'video/webm',
   mkv: 'video/x-matroska',
   mov: 'video/quicktime',
   mp3: 'audio/mpeg',
   wav: 'audio/wav',
   ogg: 'audio/ogg',
   m4a: 'audio/mp4',
   pdf: 'application/pdf',
}

const HEADER_BYTES = 65536
const MOOV_MAX_BYTES = 4 * 1024 * 1024

export function mediaSyncExtension(key: string): string | null {
   const name = key.split('/').pop() ?? key
   const dot = name.lastIndexOf('.')
   if (dot <= 0) return null
   return name.slice(dot + 1).toLowerCase()
}

export function isSyncableMediaKey(key: string): boolean {
   const name = key.split('/').pop() ?? key
   if (!name || name.startsWith('.')) return false
   const extension = mediaSyncExtension(key)
   return !!extension && extension in MEDIA_SYNC_MIME_TYPES
}

export function mediaMimeForKey(key: string): string | null {
   const extension = mediaSyncExtension(key)
   return (extension && MEDIA_SYNC_MIME_TYPES[extension]) ?? null
}

export function mediaSyncFolder(key: string): string | null {
   const slash = key.lastIndexOf('/')
   return slash === -1 ? null : key.slice(0, slash) || null
}

function view(bytes: Uint8Array) {
   return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
   let out = ''
   for (let i = offset; i < offset + length && i < bytes.length; i++) {
      out += String.fromCharCode(bytes[i]!)
   }
   return out
}

function startsWith(bytes: Uint8Array, offset: number, signature: number[]): boolean {
   if (bytes.length < offset + signature.length) return false
   return signature.every((byte, index) => bytes[offset + index] === byte)
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export function pngImageSize(bytes: Uint8Array): ImageSize | null {
   if (!startsWith(bytes, 0, PNG_SIGNATURE)) return null
   if (bytes.length < 24 || ascii(bytes, 12, 4) !== 'IHDR') return null
   const data = view(bytes)
   const width = data.getUint32(16)
   const height = data.getUint32(20)
   return width && height ? { width, height } : null
}

const JPEG_STANDALONE_MARKERS = new Set([
   0x01, 0xd8, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7,
])
const JPEG_SOF_MARKERS = new Set([
   0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
])

export function jpegImageSize(bytes: Uint8Array): ImageSize | null {
   if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
   const data = view(bytes)
   let offset = 2
   while (offset + 3 < bytes.length) {
      if (bytes[offset] !== 0xff) {
         offset++
         continue
      }
      let marker = bytes[offset + 1]!
      while (marker === 0xff && offset + 2 < bytes.length) {
         offset++
         marker = bytes[offset + 1]!
      }
      if (JPEG_STANDALONE_MARKERS.has(marker)) {
         offset += 2
         continue
      }
      if (marker === 0xd9 || marker === 0xda) return null
      const segmentLength = data.getUint16(offset + 2)
      if (segmentLength < 2) return null
      if (JPEG_SOF_MARKERS.has(marker)) {
         if (offset + 9 > bytes.length) return null
         const height = data.getUint16(offset + 5)
         const width = data.getUint16(offset + 7)
         return width && height ? { width, height } : null
      }
      offset += 2 + segmentLength
   }
   return null
}

export function webpImageSize(bytes: Uint8Array): ImageSize | null {
   if (bytes.length < 16 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') {
      return null
   }
   const data = view(bytes)
   const format = ascii(bytes, 12, 4)
   if (format === 'VP8 ') {
      if (bytes.length < 30) return null
      if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null
      const width = data.getUint16(26, true) & 0x3fff
      const height = data.getUint16(28, true) & 0x3fff
      return width && height ? { width, height } : null
   }
   if (format === 'VP8L') {
      if (bytes.length < 25 || bytes[20] !== 0x2f) return null
      const bits = data.getUint32(21, true)
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
   }
   if (format === 'VP8X') {
      if (bytes.length < 30) return null
      const width = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16))
      const height = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16))
      return { width, height }
   }
   return null
}

export function gifImageSize(bytes: Uint8Array): ImageSize | null {
   if (bytes.length < 10 || ascii(bytes, 0, 3) !== 'GIF') return null
   const version = ascii(bytes, 3, 3)
   if (version !== '87a' && version !== '89a') return null
   const data = view(bytes)
   const width = data.getUint16(6, true)
   const height = data.getUint16(8, true)
   return width && height ? { width, height } : null
}

export function imageSizeFromBuffer(bytes: Uint8Array): ImageSize | null {
   return pngImageSize(bytes) ?? gifImageSize(bytes) ?? webpImageSize(bytes) ?? jpegImageSize(bytes)
}

interface BoxHeader {
   type: string
   headerLength: number
   size: number | null
}

interface BoxRange {
   type: string
   start: number
   end: number
   next: number
}

const ISO_BMFF_TOP_LEVEL = new Set([
   'ftyp',
   'styp',
   'moov',
   'moof',
   'mdat',
   'free',
   'skip',
   'wide',
   'pnot',
   'meta',
   'uuid',
])

const FIXED_POINT_16_16 = 65536

function readBoxHeader(bytes: Uint8Array, offset: number): BoxHeader | null {
   if (offset + 8 > bytes.length) return null
   const data = view(bytes)
   const declared = data.getUint32(offset)
   const type = ascii(bytes, offset + 4, 4)
   if (declared === 1) {
      if (offset + 16 > bytes.length) return null
      const size = data.getUint32(offset + 8) * 2 ** 32 + data.getUint32(offset + 12)
      return { type, headerLength: 16, size }
   }
   return { type, headerLength: 8, size: declared === 0 ? null : declared }
}

function readBoxRange(bytes: Uint8Array, offset: number, end: number): BoxRange | null {
   const box = readBoxHeader(bytes, offset)
   if (!box) return null
   const size = box.size ?? end - offset
   if (size < box.headerLength) return null
   return {
      type: box.type,
      start: offset + box.headerLength,
      end: Math.min(end, offset + size),
      next: offset + size,
   }
}

function findBox(bytes: Uint8Array, start: number, end: number, type: string): BoxRange | null {
   let offset = start
   while (offset + 8 <= end) {
      const box = readBoxRange(bytes, offset, end)
      if (!box || box.next <= offset) return null
      if (box.type === type) return box
      offset = box.next
   }
   return null
}

function trackHeaderSize(bytes: Uint8Array, start: number, end: number): ImageSize | null {
   const version = bytes[start]
   if (version === undefined) return null
   const matrixOffset = start + (version === 1 ? 52 : 40)
   const sizeOffset = start + (version === 1 ? 88 : 76)
   if (sizeOffset + 8 > end) return null
   const data = view(bytes)
   const width = Math.round(data.getUint32(sizeOffset) / FIXED_POINT_16_16)
   const height = Math.round(data.getUint32(sizeOffset + 4) / FIXED_POINT_16_16)
   if (!width || !height) return null
   const quarterTurn =
      data.getInt32(matrixOffset) === 0 &&
      Math.abs(data.getInt32(matrixOffset + 4)) === FIXED_POINT_16_16
   return quarterTurn ? { width: height, height: width } : { width, height }
}

function moovVideoSize(bytes: Uint8Array, start: number, end: number): ImageSize | null {
   let offset = start
   while (offset + 8 <= end) {
      const box = readBoxRange(bytes, offset, end)
      if (!box || box.next <= offset) return null
      if (box.type === 'trak') {
         const header = findBox(bytes, box.start, box.end, 'tkhd')
         const size = header ? trackHeaderSize(bytes, header.start, header.end) : null
         if (size) return size
      }
      offset = box.next
   }
   return null
}

export function mp4VideoSize(bytes: Uint8Array): ImageSize | null {
   const first = readBoxHeader(bytes, 0)
   if (!first || !ISO_BMFF_TOP_LEVEL.has(first.type)) return null
   const moov = findBox(bytes, 0, bytes.length, 'moov')
   return moov ? moovVideoSize(bytes, moov.start, moov.end) : null
}

const EBML_SIGNATURE = [0x1a, 0x45, 0xdf, 0xa3]
const EBML_SEGMENT = 0x18538067
const EBML_TRACKS = 0x1654ae6b
const EBML_TRACK_ENTRY = 0xae
const EBML_VIDEO = 0xe0
const EBML_PIXEL_WIDTH = 0xb0
const EBML_PIXEL_HEIGHT = 0xba
const EBML_DISPLAY_WIDTH = 0x54b0
const EBML_DISPLAY_HEIGHT = 0x54ba
const EBML_PARENTS = new Set([EBML_SEGMENT, EBML_TRACKS, EBML_TRACK_ENTRY])

interface EbmlElement {
   id: number
   start: number
   end: number
   next: number
}

function readEbmlVint(bytes: Uint8Array, offset: number, keepMarker: boolean) {
   const first = bytes[offset]
   if (!first) return null
   let length = 1
   let mask = 0x80
   while (length <= 8 && !(first & mask)) {
      length++
      mask >>= 1
   }
   if (length > 8 || offset + length > bytes.length) return null
   let value = keepMarker ? first : first & (mask - 1)
   for (let index = 1; index < length; index++) value = value * 256 + bytes[offset + index]!
   return { value, length, unknown: !keepMarker && value === 2 ** (7 * length) - 1 }
}

function readEbmlElement(bytes: Uint8Array, offset: number, end: number): EbmlElement | null {
   const id = readEbmlVint(bytes, offset, true)
   if (!id) return null
   const size = readEbmlVint(bytes, offset + id.length, false)
   if (!size) return null
   const start = offset + id.length + size.length
   const elementEnd = size.unknown ? end : Math.min(end, start + size.value)
   return { id: id.value, start, end: elementEnd, next: Math.max(start, elementEnd) }
}

function readEbmlUint(bytes: Uint8Array, start: number, end: number): number {
   let value = 0
   for (let index = start; index < end && index < bytes.length; index++) {
      value = value * 256 + bytes[index]!
   }
   return value
}

function matroskaTrackSize(bytes: Uint8Array, start: number, end: number): ImageSize | null {
   let pixelWidth = 0
   let pixelHeight = 0
   let displayWidth = 0
   let displayHeight = 0
   let offset = start
   while (offset < end) {
      const element = readEbmlElement(bytes, offset, end)
      if (!element || element.next <= offset) break
      if (element.id === EBML_PIXEL_WIDTH) {
         pixelWidth = readEbmlUint(bytes, element.start, element.end)
      } else if (element.id === EBML_PIXEL_HEIGHT) {
         pixelHeight = readEbmlUint(bytes, element.start, element.end)
      } else if (element.id === EBML_DISPLAY_WIDTH) {
         displayWidth = readEbmlUint(bytes, element.start, element.end)
      } else if (element.id === EBML_DISPLAY_HEIGHT) {
         displayHeight = readEbmlUint(bytes, element.start, element.end)
      }
      offset = element.next
   }
   const width = displayWidth || pixelWidth
   const height = displayHeight || pixelHeight
   return width && height ? { width, height } : null
}

function matroskaVideoSizeIn(bytes: Uint8Array, start: number, end: number): ImageSize | null {
   let offset = start
   while (offset < end) {
      const element = readEbmlElement(bytes, offset, end)
      if (!element || element.next <= offset) return null
      if (element.id === EBML_VIDEO) {
         const size = matroskaTrackSize(bytes, element.start, element.end)
         if (size) return size
      } else if (EBML_PARENTS.has(element.id)) {
         const size = matroskaVideoSizeIn(bytes, element.start, element.end)
         if (size) return size
      }
      offset = element.next
   }
   return null
}

export function matroskaVideoSize(bytes: Uint8Array): ImageSize | null {
   if (!startsWith(bytes, 0, EBML_SIGNATURE)) return null
   return matroskaVideoSizeIn(bytes, 0, bytes.length)
}

export function videoSizeFromBuffer(bytes: Uint8Array): ImageSize | null {
   return mp4VideoSize(bytes) ?? matroskaVideoSize(bytes)
}

async function readChunk(handle: FileHandle, position: number, length: number) {
   if (length <= 0) return new Uint8Array(0)
   const buffer = new Uint8Array(length)
   const { bytesRead } = await handle.read(buffer, 0, length, position)
   return buffer.subarray(0, bytesRead)
}

async function readHeader(path: string, size: number): Promise<Uint8Array | null> {
   const length = Math.min(size, HEADER_BYTES)
   if (length <= 0) return null
   const handle = await open(path, 'r')
   try {
      return await readChunk(handle, 0, length)
   } finally {
      await handle.close()
   }
}

async function readMoovVideoSize(handle: FileHandle, fileSize: number): Promise<ImageSize | null> {
   let position = 0
   while (position + 8 <= fileSize) {
      const header = await readChunk(handle, position, 16)
      const box = header.length >= 8 ? readBoxHeader(header, 0) : null
      if (!box) return null
      const size = box.size ?? fileSize - position
      if (size < box.headerLength) return null
      if (box.type === 'moov') {
         return mp4VideoSize(await readChunk(handle, position, Math.min(size, MOOV_MAX_BYTES)))
      }
      position += size
   }
   return null
}

async function readVideoSize(path: string, fileSize: number): Promise<ImageSize | null> {
   if (fileSize <= 0) return null
   const handle = await open(path, 'r')
   try {
      const head = await readChunk(handle, 0, Math.min(fileSize, HEADER_BYTES))
      return videoSizeFromBuffer(head) ?? (await readMoovVideoSize(handle, fileSize))
   } catch {
      return null
   } finally {
      await handle.close()
   }
}

export async function scanMediaDirectory(root: string): Promise<ScannedMediaFile[]> {
   const files: ScannedMediaFile[] = []

   const walk = async (dir: string, prefix: string) => {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
         if (entry.name.startsWith('.')) continue
         const key = prefix ? `${prefix}/${entry.name}` : entry.name
         const path = join(dir, entry.name)
         if (entry.isDirectory()) {
            await walk(path, key)
            continue
         }
         if (!entry.isFile() || !isSyncableMediaKey(key)) continue
         const info = await stat(path)
         files.push({ key, size: info.size })
      }
   }

   await walk(root, '')
   return files.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

const IMAGE_SIZE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const VIDEO_SIZE_MIME_TYPES = new Set([
   'video/mp4',
   'video/x-m4v',
   'video/quicktime',
   'video/webm',
   'video/x-matroska',
])

export async function readMediaFileMeta(
   root: string,
   file: ScannedMediaFile
): Promise<MediaFileMeta> {
   const mime = mediaMimeForKey(file.key)
   const path = join(root, ...file.key.split('/'))
   let size: ImageSize | null = null
   if (mime && IMAGE_SIZE_MIME_TYPES.has(mime)) {
      const header = await readHeader(path, file.size)
      size = header ? imageSizeFromBuffer(header) : null
   } else if (mime && VIDEO_SIZE_MIME_TYPES.has(mime)) {
      size = await readVideoSize(path, file.size)
   }
   return {
      key: file.key,
      folder: mediaSyncFolder(file.key),
      mime,
      size: file.size,
      width: size?.width ?? null,
      height: size?.height ?? null,
   }
}
