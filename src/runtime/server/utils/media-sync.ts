import { open, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export interface ScannedMediaFile {
   key: string
   size: number
}

export interface MediaSyncRow {
   key: string
   size: number | null
}

export interface MediaSyncPlan {
   insert: ScannedMediaFile[]
   update: ScannedMediaFile[]
   remove: string[]
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
   webm: 'video/webm',
   mov: 'video/quicktime',
   mp3: 'audio/mpeg',
   wav: 'audio/wav',
   ogg: 'audio/ogg',
   m4a: 'audio/mp4',
   pdf: 'application/pdf',
}

const HEADER_BYTES = 65536

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

async function readHeader(path: string, size: number): Promise<Uint8Array | null> {
   const length = Math.min(size, HEADER_BYTES)
   if (length <= 0) return null
   const handle = await open(path, 'r')
   try {
      const buffer = new Uint8Array(length)
      const { bytesRead } = await handle.read(buffer, 0, length, 0)
      return buffer.subarray(0, bytesRead)
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

export function planMediaSync(files: ScannedMediaFile[], rows: MediaSyncRow[]): MediaSyncPlan {
   const rowByKey = new Map(rows.map((row) => [row.key, row]))
   const insert: ScannedMediaFile[] = []
   const update: ScannedMediaFile[] = []

   for (const file of files) {
      const row = rowByKey.get(file.key)
      if (!row) insert.push(file)
      else if (row.size !== file.size) update.push(file)
   }

   const scanned = new Set(files.map((file) => file.key))
   const remove = rows.filter((row) => !scanned.has(row.key)).map((row) => row.key)

   return { insert, update, remove }
}

export async function readMediaFileMeta(
   root: string,
   file: ScannedMediaFile
): Promise<MediaFileMeta> {
   const mime = mediaMimeForKey(file.key)
   let size: ImageSize | null = null
   if (
      mime === 'image/png' ||
      mime === 'image/jpeg' ||
      mime === 'image/webp' ||
      mime === 'image/gif'
   ) {
      const header = await readHeader(join(root, ...file.key.split('/')), file.size)
      size = header ? imageSizeFromBuffer(header) : null
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

export function chunked<T>(items: T[], size: number): T[][] {
   const chunks: T[][] = []
   for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size))
   }
   return chunks
}
