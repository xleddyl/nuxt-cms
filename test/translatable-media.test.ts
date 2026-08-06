import { describe, expect, it } from 'vitest'
import {
   decodeEntryTranslatableMedia,
   decodeTranslatableMedia,
   encodeEntryTranslatableMedia,
   encodeTranslatableMedia,
   isTranslatableField,
   isTranslatableMediaField,
   pickTranslatedMedia,
   translatableFieldKeys,
} from '../src/runtime/shared/index'
import { sampleConfig } from './fixtures'

const events = sampleConfig().events!

function resolve(stored: unknown, locale: string, defaultLocale = 'en') {
   return pickTranslatedMedia(decodeTranslatableMedia(stored, defaultLocale), locale, defaultLocale)
}

describe('translatable media field config', () => {
   it('treats a translatable media field as translatable', () => {
      expect(isTranslatableField(events.fields.brochure!)).toBe(true)
      expect(isTranslatableMediaField(events.fields.brochure!)).toBe(true)
   })

   it('leaves plain media fields untouched', () => {
      expect(isTranslatableField(events.fields.poster!)).toBe(false)
      expect(isTranslatableMediaField(events.fields.poster!)).toBe(false)
   })

   it('does not report translatable text fields as media', () => {
      expect(isTranslatableMediaField(events.fields.description!)).toBe(false)
   })

   it('lists translatable media alongside translatable text', () => {
      expect(translatableFieldKeys(events)).toEqual(['description', 'brochure'])
   })
})

describe('translatable media storage shape', () => {
   it('encodes a locale map to a JSON string', () => {
      expect(encodeTranslatableMedia({ en: 'a/en.pdf', de: 'a/de.pdf' })).toBe(
         '{"en":"a/en.pdf","de":"a/de.pdf"}'
      )
   })

   it('drops empty locales and returns null for an empty map', () => {
      expect(encodeTranslatableMedia({ en: 'a/en.pdf', de: '' })).toBe('{"en":"a/en.pdf"}')
      expect(encodeTranslatableMedia({ en: '   ' })).toBeNull()
      expect(encodeTranslatableMedia({})).toBeNull()
      expect(encodeTranslatableMedia(null)).toBeNull()
   })

   it('round-trips through encode and decode', () => {
      const stored = encodeTranslatableMedia({ en: 'a/en.pdf', de: 'a/de.pdf' })
      expect(decodeTranslatableMedia(stored, 'en')).toEqual({ en: 'a/en.pdf', de: 'a/de.pdf' })
   })

   it('encodes entry values only for translatable media fields', () => {
      const encoded = encodeEntryTranslatableMedia(events, {
         poster: 'a/poster.png',
         brochure: { en: 'a/en.pdf' },
         description: { en: '<p>hi</p>' },
      })
      expect(encoded.poster).toBe('a/poster.png')
      expect(encoded.brochure).toBe('{"en":"a/en.pdf"}')
      expect(encoded.description).toEqual({ en: '<p>hi</p>' })
   })

   it('decodes entry rows back into locale maps', () => {
      const [row] = decodeEntryTranslatableMedia(
         events,
         [{ poster: 'a/poster.png', brochure: '{"en":"a/en.pdf"}' }],
         'en'
      )
      expect(row!.poster).toBe('a/poster.png')
      expect(row!.brochure).toEqual({ en: 'a/en.pdf' })
   })
})

describe('translatable media locale resolution', () => {
   const stored = '{"en":"a/en.pdf","de":"a/de.pdf"}'

   it('returns the requested locale', () => {
      expect(resolve(stored, 'de')).toBe('a/de.pdf')
   })

   it('falls back to the default locale', () => {
      expect(resolve(stored, 'it')).toBe('a/en.pdf')
   })

   it('falls back to any available locale when the default is empty', () => {
      expect(resolve('{"de":"a/de.pdf"}', 'it')).toBe('a/de.pdf')
      expect(resolve('{"en":"","de":"a/de.pdf"}', 'en')).toBe('a/de.pdf')
   })

   it('returns null when nothing is stored', () => {
      expect(resolve(null, 'en')).toBeNull()
      expect(resolve('', 'en')).toBeNull()
      expect(resolve('{}', 'en')).toBeNull()
   })
})

describe('translatable media backward compatibility', () => {
   it('reads a plain key as the default locale value', () => {
      expect(decodeTranslatableMedia('2026/07/poster.png', 'en')).toEqual({
         en: '2026/07/poster.png',
      })
   })

   it('resolves a plain key for every requested locale', () => {
      expect(resolve('2026/07/poster.png', 'de')).toBe('2026/07/poster.png')
      expect(resolve('2026/07/poster.png', 'en')).toBe('2026/07/poster.png')
   })

   it('treats malformed JSON as a plain key', () => {
      expect(resolve('{not json', 'de')).toBe('{not json')
   })

   it('ignores JSON arrays and reads them as a plain key', () => {
      expect(decodeTranslatableMedia('["a"]', 'en')).toEqual({ en: '["a"]' })
   })

   it('accepts an already decoded locale map', () => {
      expect(decodeTranslatableMedia({ de: 'a/de.pdf' }, 'en')).toEqual({ de: 'a/de.pdf' })
   })
})
