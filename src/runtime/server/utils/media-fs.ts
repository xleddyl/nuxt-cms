import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, rmdir, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createError } from 'h3'
import { formatFileSize } from '../../shared/index'

export function mediaFilePath(dir: string, key: string): string | null {
   if (!dir || !key || key.startsWith('/') || /[\0\\]/.test(key)) return null
   const root = resolve(dir)
   const target = resolve(root, ...key.split('/'))
   const rel = relative(root, target)
   if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
   return target
}

export function requireMediaFilePath(dir: string, key: string): string {
   const path = mediaFilePath(dir, key)
   if (!path) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid object key' })
   }
   return path
}

export type ByteRange = { start: number; end: number } | 'unsatisfiable' | null

export function parseByteRange(header: string | undefined, size: number): ByteRange {
   if (!header) return null
   const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
   if (!match || (!match[1] && !match[2])) return null
   if (size === 0) return 'unsatisfiable'
   if (!match[1]) {
      const suffix = Number(match[2])
      if (suffix === 0) return 'unsatisfiable'
      return { start: Math.max(0, size - suffix), end: size - 1 }
   }
   const start = Number(match[1])
   const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
   if (start >= size || end < start) return 'unsatisfiable'
   return { start, end }
}

function sizeLimit(maxBytes: number) {
   let received = 0
   return new Transform({
      transform(chunk: Buffer, _encoding, callback) {
         received += chunk.length
         if (received > maxBytes) {
            callback(
               createError({
                  statusCode: 413,
                  statusMessage: `File exceeds the maximum size of ${formatFileSize(maxBytes)}`,
               })
            )
            return
         }
         callback(null, chunk)
      },
   })
}

export async function writeMediaFile(
   dir: string,
   key: string,
   body: ReadableStream<Uint8Array> | Uint8Array,
   maxBytes: number
) {
   const target = requireMediaFilePath(dir, key)
   await mkdir(dirname(target), { recursive: true })
   const temp = `${target}.${randomUUID()}.upload`
   const source =
      body instanceof Uint8Array
         ? Readable.from([Buffer.from(body)])
         : Readable.fromWeb(body as never)
   try {
      await pipeline(source, sizeLimit(maxBytes), createWriteStream(temp, { flags: 'wx' }))
      await rename(temp, target)
   } catch (error) {
      await rm(temp, { force: true })
      throw error
   }
}

export async function removeMediaFile(dir: string, key: string) {
   const target = requireMediaFilePath(dir, key)
   try {
      await unlink(target)
   } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
   }
   await pruneEmptyDirectories(resolve(dir), dirname(target))
}

async function pruneEmptyDirectories(root: string, from: string) {
   let current = from
   while (current !== root && current.startsWith(`${root}${sep}`)) {
      try {
         await rmdir(current)
      } catch {
         return
      }
      current = dirname(current)
   }
}
