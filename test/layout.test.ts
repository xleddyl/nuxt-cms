import { describe, expect, it } from 'vitest'
import type { FieldConfig } from '../src/runtime/shared/index'
import {
   defaultListColumns,
   layoutFromConfig,
   resolveFormLayout,
   resolveListColumns,
} from '../src/runtime/shared/index'
import { validateConfig } from '../src/schema-codegen'
import { I18N, sampleConfig } from './fixtures'

const fields: Record<string, FieldConfig> = {
   title: { label: 'Title', type: 'text' },
   slug: { label: 'Slug', type: 'slug', from: 'title' },
   date: { label: 'Date', type: 'date' },
   featured: { label: 'Featured', type: 'boolean' },
   notes: { label: 'Notes', type: 'text' },
}

describe('layoutFromConfig', () => {
   it('groups loose rows into untitled sections around titled ones', () => {
      const layout = layoutFromConfig([
         ['title', 'slug'],
         'date',
         { title: 'Extra', collapsed: true, rows: ['notes'] },
         'featured',
      ])
      expect(layout).toEqual({
         main: [
            { rows: [['title', 'slug'], ['date']] },
            { title: 'Extra', collapsed: true, rows: [['notes']] },
            { rows: [['featured']] },
         ],
      })
   })
})

describe('resolveFormLayout', () => {
   it('puts every field in its own row when there is no layout', () => {
      const layout = resolveFormLayout(fields, undefined)
      expect(layout.main).toEqual([{ rows: Object.keys(fields).map((key) => [key]) }])
   })

   it('drops unknown and repeated keys and appends missing fields', () => {
      const layout = resolveFormLayout(fields, {
         main: [
            {
               rows: [
                  ['title', 'gone'],
                  ['title', 'slug'],
               ],
            },
         ],
      })
      expect(layout.main).toEqual([
         { rows: [['title'], ['slug'], ['date'], ['featured'], ['notes']] },
      ])
   })

   it('appends missing fields after a titled section in a new untitled one', () => {
      const layout = resolveFormLayout(fields, {
         main: [{ title: 'Basics', rows: [['title', 'slug', 'date', 'featured']] }],
      })
      expect(layout.main.at(-1)).toEqual({ rows: [['notes']] })
   })

   it('keeps a mobile media field next to its parent', () => {
      const withMobile: Record<string, FieldConfig> = {
         cover: { label: 'Cover', type: 'media', mobile: true },
         coverMobile: { label: 'Cover (mobile)', type: 'media', mobileOf: 'cover' },
         title: { label: 'Title', type: 'text' },
      }
      const layout = resolveFormLayout(withMobile, {
         main: [{ rows: [['title'], ['cover']] }],
      })
      expect(layout.main[0]!.rows).toEqual([['title'], ['cover', 'coverMobile']])
   })

   it('puts a mobile media field on its own row when the parent row is full', () => {
      const withMobile: Record<string, FieldConfig> = {
         a: { label: 'A', type: 'text' },
         b: { label: 'B', type: 'text' },
         c: { label: 'C', type: 'text' },
         cover: { label: 'Cover', type: 'media', mobile: true },
         coverMobile: { label: 'Cover (mobile)', type: 'media', mobileOf: 'cover' },
      }
      const layout = resolveFormLayout(withMobile, {
         main: [{ rows: [['a', 'b', 'c', 'cover']] }],
      })
      expect(layout.main[0]!.rows).toEqual([['a', 'b', 'c', 'cover'], ['coverMobile']])
   })

   it('does not change the layout it receives', () => {
      const saved = { main: [{ rows: [['title', 'gone']] }] }
      resolveFormLayout(fields, saved)
      expect(saved.main[0]!.rows[0]).toEqual(['title', 'gone'])
   })
})

describe('list columns', () => {
   it('defaults to the first four fields and the extra columns', () => {
      expect(defaultListColumns(fields, undefined, ['status'])).toEqual([
         'title',
         'slug',
         'date',
         'featured',
         'status',
      ])
   })

   it('uses the configured columns', () => {
      expect(defaultListColumns(fields, { columns: ['date', 'title'] })).toEqual(['date', 'title'])
   })

   it('prefers the saved columns and drops unknown keys', () => {
      expect(resolveListColumns(fields, ['notes', 'gone', 'title'], { columns: ['date'] })).toEqual(
         ['notes', 'title']
      )
   })

   it('falls back to the default when nothing saved is valid', () => {
      expect(resolveListColumns(fields, ['gone'], { columns: ['date'] })).toEqual(['date'])
   })
})

describe('validateConfig with layout and list', () => {
   it('accepts a valid layout, list and icon', () => {
      const config = sampleConfig()
      config.events!.icon = 'calendar'
      config.events!.layout = [['title', 'slug'], { title: 'More', rows: ['description'] }]
      config.events!.list = { columns: ['title', 'date', 'status'] }
      expect(validateConfig(config, I18N)).toEqual([])
   })

   it('rejects unknown, repeated and crowded layout keys', () => {
      const config = sampleConfig()
      config.events!.layout = [
         ['title', 'nope'],
         'title',
         ['slug', 'seats', 'date', 'featured', 'visibility'],
         { title: '', rows: [] },
      ]
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("'nope', which is not a declared field"))).toBe(true)
      expect(errors.some((e) => e.includes("'title' more than once"))).toBe(true)
      expect(errors.some((e) => e.includes('more than 4 fields'))).toBe(true)
      expect(errors.some((e) => e.includes('needs a title'))).toBe(true)
   })

   it('rejects unknown list columns and lists outside collections', () => {
      const config = sampleConfig()
      config.events!.list = { columns: ['title', 'nope'] }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("list.columns names 'nope'"))).toBe(true)
   })

   it('reserves the settings names', () => {
      const config = sampleConfig()
      config.settings = config.categories!
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("'settings' is a reserved name"))).toBe(true)
   })
})
