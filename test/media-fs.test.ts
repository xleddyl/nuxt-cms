import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
   mediaFilePath,
   parseByteRange,
   removeMediaFile,
   writeMediaFile,
} from '../src/runtime/server/utils/media-fs'

function streamOf(...chunks: string[]) {
   return new ReadableStream<Uint8Array>({
      start(controller) {
         for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
         controller.close()
      },
   })
}

describe('mediaFilePath', () => {
   it('resolves a nested key inside the directory', () => {
      expect(mediaFilePath('/data/media', '2026/09/a.webp')).toBe(
         join('/data/media', '2026', '09', 'a.webp')
      )
   })

   it.each(['../cms.db', 'a/../../cms.db', '/etc/passwd', '', 'a\0b', '.', 'a/..'])(
      'rejects %j',
      (key) => {
         expect(mediaFilePath('/data/media', key)).toBeNull()
      }
   )

   it('rejects any key without a directory', () => {
      expect(mediaFilePath('', 'a.webp')).toBeNull()
   })
})

describe('parseByteRange', () => {
   it('returns null without a header or with an unknown unit', () => {
      expect(parseByteRange(undefined, 100)).toBeNull()
      expect(parseByteRange('items=0-1', 100)).toBeNull()
      expect(parseByteRange('bytes=-', 100)).toBeNull()
   })

   it('parses a closed range', () => {
      expect(parseByteRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 })
   })

   it('parses an open range', () => {
      expect(parseByteRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 })
   })

   it('parses a suffix range', () => {
      expect(parseByteRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 })
      expect(parseByteRange('bytes=-500', 100)).toEqual({ start: 0, end: 99 })
   })

   it('clamps the end to the file size', () => {
      expect(parseByteRange('bytes=0-999', 100)).toEqual({ start: 0, end: 99 })
   })

   it('flags a range outside the file', () => {
      expect(parseByteRange('bytes=100-', 100)).toBe('unsatisfiable')
      expect(parseByteRange('bytes=20-10', 100)).toBe('unsatisfiable')
      expect(parseByteRange('bytes=-0', 100)).toBe('unsatisfiable')
      expect(parseByteRange('bytes=0-', 0)).toBe('unsatisfiable')
   })
})

describe('writeMediaFile and removeMediaFile', () => {
   let dir: string

   beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'nuxt-cms-media-'))
   })

   afterEach(async () => {
      await rm(dir, { recursive: true, force: true })
   })

   it('writes a stream into nested folders', async () => {
      await writeMediaFile(dir, '2026/09/a.txt', streamOf('hello ', 'world'), 1024)
      expect(await readFile(join(dir, '2026/09/a.txt'), 'utf8')).toBe('hello world')
   })

   it('writes a byte array', async () => {
      await writeMediaFile(dir, 'folder/.keep', new Uint8Array(), 1)
      expect(existsSync(join(dir, 'folder/.keep'))).toBe(true)
   })

   it('rejects a body over the limit and leaves nothing behind', async () => {
      await expect(
         writeMediaFile(dir, 'big/a.txt', streamOf('12345', '67890'), 8)
      ).rejects.toMatchObject({ statusCode: 413 })
      expect(existsSync(join(dir, 'big/a.txt'))).toBe(false)
      expect(await readdir(join(dir, 'big'))).toEqual([])
   })

   it('rejects a key outside the directory', async () => {
      await expect(writeMediaFile(dir, '../escape.txt', streamOf('x'), 8)).rejects.toMatchObject({
         statusCode: 400,
      })
   })

   it('removes a file and the folders it leaves empty', async () => {
      await writeMediaFile(dir, '2026/09/a.txt', streamOf('a'), 8)
      await removeMediaFile(dir, '2026/09/a.txt')
      expect(existsSync(join(dir, '2026'))).toBe(false)
      expect(existsSync(dir)).toBe(true)
   })

   it('keeps a folder that still holds other files', async () => {
      await writeMediaFile(dir, 'news/a.txt', streamOf('a'), 8)
      await writeMediaFile(dir, 'news/.keep', new Uint8Array(), 1)
      await removeMediaFile(dir, 'news/a.txt')
      expect(await readdir(join(dir, 'news'))).toEqual(['.keep'])
   })

   it('ignores a file that is already gone', async () => {
      await expect(removeMediaFile(dir, 'missing/a.txt')).resolves.toBeUndefined()
   })
})
