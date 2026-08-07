import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
   collectMediaManifest,
   renderMediaManifestFile,
   renderMediaManifestTypes,
} from '../src/media-manifest-codegen'

function png(width: number, height: number) {
   const header = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
   const be = (value: number) =>
      Uint8Array.of((value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff)
   const ihdr = Uint8Array.from('IHDR', (char) => char.charCodeAt(0))
   const parts = [header, be(13), ihdr, be(width), be(height), Uint8Array.of(8, 6, 0, 0, 0), be(0)]
   const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
   let offset = 0
   for (const part of parts) {
      out.set(part, offset)
      offset += part.length
   }
   return out
}

describe('collectMediaManifest', () => {
   let root: string

   beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), 'nuxt-cms-manifest-'))
      await mkdir(join(root, 'waters'), { recursive: true })
      await writeFile(join(root, 'hero.png'), png(120, 60))
      await writeFile(join(root, 'waters', 'brochure.pdf'), '%PDF-1.4')
      await writeFile(join(root, 'notes.txt'), 'ignored')
   })

   afterAll(async () => {
      await rm(root, { recursive: true, force: true })
   })

   it('collects full metadata for every syncable file', async () => {
      const files = await collectMediaManifest(root)
      expect(files.map((file) => file.key)).toEqual(['hero.png', 'waters/brochure.pdf'])
      expect(files[0]).toMatchObject({
         key: 'hero.png',
         folder: null,
         mime: 'image/png',
         width: 120,
         height: 60,
      })
      expect(files[1]).toMatchObject({
         key: 'waters/brochure.pdf',
         folder: 'waters',
         mime: 'application/pdf',
         width: null,
         height: null,
      })
      expect(files.every((file) => file.size > 0)).toBe(true)
   })
})

describe('renderMediaManifestFile', () => {
   it('marks the manifest as generated and embeds the metadata', () => {
      const contents = renderMediaManifestFile([
         { key: 'hero.png', folder: null, mime: 'image/png', size: 42, width: 120, height: 60 },
      ])
      expect(contents).toContain('export const generated = true')
      expect(contents).toContain('"key": "hero.png"')
      expect(contents).toContain('"width": 120')
   })

   it('emits an empty, ungenerated manifest when there is nothing to scan', () => {
      const contents = renderMediaManifestFile(null)
      expect(contents).toContain('export const generated = false')
      expect(contents).toContain('export const files = []')
   })

   it('keeps an empty generated manifest distinguishable from an ungenerated one', () => {
      const contents = renderMediaManifestFile([])
      expect(contents).toContain('export const generated = true')
      expect(contents).toContain('export const files = []')
   })

   it('emits type annotations only in the declaration file', () => {
      expect(renderMediaManifestFile([])).not.toContain('MediaFileMeta')
      const types = renderMediaManifestTypes('/abs/media-sync')
      expect(types).toContain("import type { MediaFileMeta } from '/abs/media-sync'")
      expect(types).toContain('export declare const generated: boolean')
      expect(types).toContain('export declare const files: MediaFileMeta[]')
   })
})
