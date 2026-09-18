import { describe, expect, it } from 'vitest'
import type { CmsTab, FieldConfig } from '../src/runtime/shared/index'
import { entryTabs, fieldTab, fieldsByTab } from '../src/runtime/shared/index'
import { validateConfig } from '../src/schema-codegen'
import { I18N, sampleConfig } from './fixtures'

const TABS: CmsTab[] = [
   { id: 'content', label: 'Content' },
   { id: 'media', label: 'Media' },
]

const FIELDS: Record<string, FieldConfig> = {
   title: { label: 'Title', type: 'text' },
   cover: { label: 'Cover', type: 'media', tab: 'media' },
   body: { label: 'Body', type: 'text', tab: 'content' },
   stray: { label: 'Stray', type: 'text', tab: 'nowhere' },
}

describe('entryTabs', () => {
   it('returns an empty list when the entry declares none', () => {
      expect(entryTabs({})).toEqual([])
      expect(entryTabs({ tabs: [] })).toEqual([])
   })

   it('returns the declared tabs in order', () => {
      expect(entryTabs({ tabs: TABS })).toEqual(TABS)
   })
})

describe('fieldTab', () => {
   it('sends a field with no tab to the first one', () => {
      expect(fieldTab(FIELDS.title!, TABS)).toBe('content')
   })

   it('keeps a declared tab', () => {
      expect(fieldTab(FIELDS.cover!, TABS)).toBe('media')
   })

   it('sends an unknown tab to the first one', () => {
      expect(fieldTab(FIELDS.stray!, TABS)).toBe('content')
   })

   it('returns nothing when there are no tabs', () => {
      expect(fieldTab(FIELDS.cover!, [])).toBeUndefined()
   })
})

describe('fieldsByTab', () => {
   it('groups every field under a tab', () => {
      const grouped = fieldsByTab(FIELDS, TABS)
      expect(Object.keys(grouped)).toEqual(['content', 'media'])
      expect(Object.keys(grouped.content!)).toEqual(['title', 'body', 'stray'])
      expect(Object.keys(grouped.media!)).toEqual(['cover'])
   })

   it('returns nothing when there are no tabs', () => {
      expect(fieldsByTab(FIELDS, [])).toEqual({})
   })
})

describe('validateConfig with tabs', () => {
   it('accepts fields that point at a declared tab', () => {
      const config = sampleConfig()
      config.categories!.tabs = TABS
      config.categories!.fields.name!.tab = 'media'
      expect(validateConfig(config, I18N)).toEqual([])
   })

   it('rejects a field that points at an unknown tab', () => {
      const config = sampleConfig()
      config.categories!.tabs = TABS
      config.categories!.fields.name!.tab = 'nowhere'
      const errors = validateConfig(config, I18N)
      expect(errors.some((error) => error.includes("unknown tab 'nowhere'"))).toBe(true)
   })

   it('rejects a field with a tab when the entry declares none', () => {
      const config = sampleConfig()
      config.categories!.fields.name!.tab = 'content'
      const errors = validateConfig(config, I18N)
      expect(errors.some((error) => error.includes('the entry declares none'))).toBe(true)
   })

   it('rejects two tabs with the same id', () => {
      const config = sampleConfig()
      config.categories!.tabs = [...TABS, { id: 'media', label: 'Again' }]
      const errors = validateConfig(config, I18N)
      expect(errors.some((error) => error.includes('declared twice'))).toBe(true)
   })

   it('rejects a tab without a label', () => {
      const config = sampleConfig()
      config.categories!.tabs = [{ id: 'content', label: '' }]
      const errors = validateConfig(config, I18N)
      expect(errors.some((error) => error.includes('needs a label'))).toBe(true)
   })
})
