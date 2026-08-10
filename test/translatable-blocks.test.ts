import { describe, expect, it } from 'vitest'
import type { FieldConfig } from '../src/runtime/shared/index'
import {
   hasTranslatableBlockFields,
   localizeBlocks,
   translatableBlockFieldKeys,
} from '../src/runtime/shared/index'
import { sampleConfig } from './fixtures'

function bodyField(): FieldConfig {
   const field = sampleConfig().events!.fields.body!
   field.blocks!.hero!.fields.heading!.translatable = true
   field.blocks!.hero!.fields.image = { label: 'Image', type: 'media', translatable: true }
   return field
}

const localize = (field: FieldConfig, items: unknown, locale: string) =>
   localizeBlocks(field, items, locale, 'en')

describe('translatable block field config', () => {
   it('detects blocks fields holding translatable sub-fields', () => {
      expect(hasTranslatableBlockFields(bodyField())).toBe(true)
   })

   it('ignores blocks fields without translatable sub-fields', () => {
      expect(hasTranslatableBlockFields(sampleConfig().events!.fields.body!)).toBe(false)
   })

   it('is false for non-blocks fields', () => {
      expect(hasTranslatableBlockFields(sampleConfig().events!.fields.description!)).toBe(false)
   })

   it('lists only the translatable keys of a block', () => {
      expect(translatableBlockFieldKeys(bodyField().blocks!.hero!)).toEqual(['heading', 'image'])
      expect(translatableBlockFieldKeys(bodyField().blocks!.quote!)).toEqual([])
   })
})

describe('block localization', () => {
   it('resolves translatable block values to the requested locale', () => {
      const items = [{ type: 'hero', heading: { en: 'Welcome', it: 'Benvenuto' } }]
      expect(localize(bodyField(), items, 'it')).toEqual([
         { type: 'hero', heading: 'Benvenuto', image: null },
      ])
   })

   it('falls back to the default locale when a translation is missing', () => {
      const items = [{ type: 'hero', heading: { en: 'Welcome' } }]
      expect(localize(bodyField(), items, 'it')).toEqual([
         { type: 'hero', heading: 'Welcome', image: null },
      ])
   })

   it('resolves a missing value to null', () => {
      const items = [{ type: 'hero', heading: null }]
      expect(localize(bodyField(), items, 'it')).toEqual([
         { type: 'hero', heading: null, image: null },
      ])
   })

   it('reads a legacy plain string as the default locale', () => {
      const items = [{ type: 'hero', heading: 'Welcome' }]
      expect(localize(bodyField(), items, 'it')).toEqual([
         { type: 'hero', heading: 'Welcome', image: null },
      ])
   })

   it('picks the media key for a translatable media block field', () => {
      const items = [
         {
            type: 'hero',
            heading: { en: 'Welcome' },
            image: { en: '2026/hero-en.png', it: '2026/hero-it.png' },
         },
      ]
      expect(localize(bodyField(), items, 'it')).toEqual([
         { type: 'hero', heading: 'Welcome', image: '2026/hero-it.png' },
      ])
   })

   it('falls back to any available locale for translatable media', () => {
      const items = [
         { type: 'hero', heading: { en: 'Welcome' }, image: { it: '2026/only-it.png' } },
      ]
      expect(localize(bodyField(), items, 'en')).toEqual([
         { type: 'hero', heading: 'Welcome', image: '2026/only-it.png' },
      ])
   })

   it('leaves non-translatable sub-fields untouched', () => {
      const items = [{ type: 'quote', text: 'Plain', author: 'Ada' }]
      expect(localize(bodyField(), items, 'it')).toEqual(items)
   })

   it('leaves blocks of an unknown type untouched', () => {
      const items = [{ type: 'nope', heading: { en: 'Welcome' } }]
      expect(localize(bodyField(), items, 'it')).toEqual(items)
   })

   it('does not mutate the stored value', () => {
      const items = [{ type: 'hero', heading: { en: 'Welcome', it: 'Benvenuto' } }]
      localize(bodyField(), items, 'it')
      expect(items[0]!.heading).toEqual({ en: 'Welcome', it: 'Benvenuto' })
   })

   it('passes through values that are not arrays', () => {
      expect(localize(bodyField(), null, 'it')).toBeNull()
   })
})
