import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { describe, expect, it, vi } from 'vitest'
import type { FieldConfig } from '../src/runtime/shared/index'
import {
   assertKnownMedia,
   mediaKeysInTable,
   mediaReferences,
} from '../src/runtime/server/utils/media-references'

const FIELDS: Record<string, FieldConfig> = {
   title: { label: 'Title', type: 'text' },
   hero: { label: 'Hero', type: 'media' },
   brochure: { label: 'Brochure', type: 'media', translatable: true },
   gallery: {
      label: 'Gallery',
      type: 'blocks',
      blocks: {
         image: {
            label: 'Image',
            fields: {
               photo: { label: 'Photo', type: 'media' },
               caption: { label: 'Caption', type: 'text' },
            },
         },
         quote: {
            label: 'Quote',
            fields: { cover: { label: 'Cover', type: 'media', translatable: true } },
         },
      },
   },
}

const VALUES = {
   title: 'library/not-media.webp',
   hero: 'library/hero.webp',
   brochure: { en: 'files/en.pdf', it: '' },
   gallery: [
      { type: 'image', photo: 'library/a.webp', caption: 'library/caption.webp' },
      { type: 'quote', cover: { it: 'library/q.webp' } },
      { type: 'image', photo: null, caption: null },
   ],
}

const cmsMedia = sqliteTable('cms_media', {
   id: integer('id').primaryKey({ autoIncrement: true }),
   key: text('key').notNull().unique(),
})

function lookupOf(keys: string[]) {
   const known = new Set(keys)
   return vi.fn(async (requested: string[]) => new Set(requested.filter((key) => known.has(key))))
}

describe('media references', () => {
   it('collects media fields, translatable media and media inside blocks', () => {
      expect(mediaReferences(FIELDS, VALUES)).toEqual([
         { field: 'hero', key: 'library/hero.webp' },
         { field: 'brochure', key: 'files/en.pdf' },
         { field: 'gallery[0].photo', key: 'library/a.webp' },
         { field: 'gallery[1].cover', key: 'library/q.webp' },
      ])
   })

   it('finds nothing in empty values', () => {
      expect(mediaReferences(FIELDS, { hero: null, gallery: null })).toEqual([])
   })
})

describe('assertKnownMedia', () => {
   it('passes when every key is in the library', async () => {
      const lookup = lookupOf([
         'library/hero.webp',
         'files/en.pdf',
         'library/a.webp',
         'library/q.webp',
      ])
      await expect(
         assertKnownMedia(mediaReferences(FIELDS, VALUES), lookup)
      ).resolves.toBeUndefined()
      expect(lookup).toHaveBeenCalledTimes(1)
   })

   it('rejects with a 400 that names the missing keys and their fields', async () => {
      const lookup = lookupOf(['library/hero.webp', 'files/en.pdf'])
      const error = await assertKnownMedia(mediaReferences(FIELDS, VALUES), lookup).catch(
         (cause: unknown) => cause
      )
      expect(error).toMatchObject({ statusCode: 400 })
      expect((error as { statusMessage: string }).statusMessage).toBe(
         "Media not found in the library: 'library/a.webp' (gallery[0].photo), 'library/q.webp' (gallery[1].cover)"
      )
   })

   it('does not look anything up without references', async () => {
      const lookup = lookupOf([])
      await assertKnownMedia([], lookup)
      expect(lookup).not.toHaveBeenCalled()
   })

   it('looks up each key once', async () => {
      const lookup = lookupOf(['a.webp'])
      await assertKnownMedia(
         [
            { field: 'hero', key: 'a.webp' },
            { field: 'gallery[0].photo', key: 'a.webp' },
         ],
         lookup
      )
      expect(lookup).toHaveBeenCalledWith(['a.webp'])
   })
})

describe('mediaKeysInTable', () => {
   it('returns the keys found in cms_media, in chunks', async () => {
      const sqlite = new Database(':memory:')
      sqlite.exec(
         'create table cms_media (id integer primary key autoincrement, key text not null unique)'
      )
      const insert = sqlite.prepare('insert into cms_media (key) values (?)')
      for (let index = 0; index < 150; index += 2) insert.run(`file-${index}.webp`)
      let queries = 0
      const db = drizzle(sqlite, { logger: { logQuery: () => queries++ } })
      const requested = Array.from({ length: 150 }, (_, index) => `file-${index}.webp`)
      const found = await mediaKeysInTable(db, cmsMedia, requested)
      expect(found.size).toBe(75)
      expect(found.has('file-0.webp')).toBe(true)
      expect(found.has('file-1.webp')).toBe(false)
      expect(queries).toBe(2)
      sqlite.close()
   })
})
