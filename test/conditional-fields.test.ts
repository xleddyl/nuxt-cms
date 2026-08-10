import { describe, expect, it } from 'vitest'
import { renderSchemaFile, validateConfig } from '../src/schema-codegen'
import { renderTypesFile } from '../src/types-codegen'
import type { CmsConfig } from '../src/runtime/shared/index'
import { fieldConditions, isFieldVisible, isRequiredField } from '../src/runtime/shared/index'
import { renderGraphqlSdl } from '../src/runtime/shared/graphql-sdl'
import { buildEntrySchema } from '../src/runtime/shared/validation'
import { I18N, sampleConfig } from './fixtures'

function conditionalConfig(): CmsConfig {
   const config = sampleConfig()
   config.events!.fields.seats!.showIf = { field: 'visibility', eq: 'public' }
   return config
}

describe('field conditions', () => {
   it('normalizes a single condition into a list', () => {
      expect(fieldConditions({ label: 'X', type: 'text' })).toEqual([])
      expect(
         fieldConditions({ label: 'X', type: 'text', showIf: { field: 'a', eq: 'b' } })
      ).toEqual([{ field: 'a', eq: 'b' }])
   })

   it('treats a field without showIf as always visible', () => {
      expect(isFieldVisible({ label: 'X', type: 'text' }, {})).toBe(true)
   })

   it('matches on eq', () => {
      const field = { label: 'X', type: 'text' as const, showIf: { field: 'kind', eq: 'a' } }
      expect(isFieldVisible(field, { kind: 'a' })).toBe(true)
      expect(isFieldVisible(field, { kind: 'b' })).toBe(false)
      expect(isFieldVisible(field, {})).toBe(false)
   })

   it('matches on in', () => {
      const field = { label: 'X', type: 'text' as const, showIf: { field: 'kind', in: ['a', 'c'] } }
      expect(isFieldVisible(field, { kind: 'a' })).toBe(true)
      expect(isFieldVisible(field, { kind: 'c' })).toBe(true)
      expect(isFieldVisible(field, { kind: 'b' })).toBe(false)
   })

   it('matches on booleans', () => {
      const field = { label: 'X', type: 'text' as const, showIf: { field: 'flag', eq: true } }
      expect(isFieldVisible(field, { flag: true })).toBe(true)
      expect(isFieldVisible(field, { flag: false })).toBe(false)
   })

   it('combines multiple conditions with and', () => {
      const field = {
         label: 'X',
         type: 'text' as const,
         showIf: [
            { field: 'kind', eq: 'a' },
            { field: 'flag', eq: true },
         ],
      }
      expect(isFieldVisible(field, { kind: 'a', flag: true })).toBe(true)
      expect(isFieldVisible(field, { kind: 'a', flag: false })).toBe(false)
      expect(isFieldVisible(field, { kind: 'b', flag: true })).toBe(false)
   })

   it('is visible for a null state only when unconditional', () => {
      expect(isFieldVisible({ label: 'X', type: 'text' }, null)).toBe(true)
      expect(
         isFieldVisible({ label: 'X', type: 'text', showIf: { field: 'kind', eq: 'a' } }, null)
      ).toBe(false)
   })
})

describe('showIf config validation', () => {
   it('accepts a well-formed condition', () => {
      expect(validateConfig(conditionalConfig(), I18N)).toEqual([])
   })

   it('accepts a list of conditions', () => {
      const config = sampleConfig()
      config.events!.fields.seats!.showIf = [
         { field: 'visibility', eq: 'public' },
         { field: 'featured', eq: true },
      ]
      expect(validateConfig(config, I18N)).toEqual([])
   })

   it('rejects a condition on an undeclared field', () => {
      const config = sampleConfig()
      config.events!.fields.seats!.showIf = { field: 'nope', eq: 'x' }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("'nope' is not a declared field"))).toBe(true)
   })

   it('rejects a self-referencing condition', () => {
      const config = sampleConfig()
      config.events!.fields.seats!.showIf = { field: 'seats', eq: 1 }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('cannot depend on itself'))).toBe(true)
   })

   it('rejects a condition on an unsupported field type', () => {
      const config = sampleConfig()
      config.events!.fields.seats!.showIf = { field: 'body', eq: 'x' }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('showIf can only depend on'))).toBe(true)
   })

   it('rejects a condition on a multi-select field', () => {
      const config = sampleConfig()
      config.events!.fields.seats!.showIf = { field: 'species', eq: 'bass' }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('showIf can only depend on'))).toBe(true)
   })

   it('rejects a condition on a translatable field', () => {
      const config = sampleConfig()
      config.events!.fields.title!.translatable = true
      config.events!.fields.seats!.showIf = { field: 'title', eq: 'x' }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('cannot depend on a translatable field'))).toBe(true)
   })

   it('rejects a condition without eq or in', () => {
      const config = sampleConfig()
      config.events!.fields.seats!.showIf = { field: 'visibility' }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("requires 'eq' or a non-empty 'in'"))).toBe(true)
   })

   it('rejects an empty in list', () => {
      const config = sampleConfig()
      config.events!.fields.seats!.showIf = { field: 'visibility', in: [] }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("requires 'eq' or a non-empty 'in'"))).toBe(true)
   })

   it('rejects values outside the target select options', () => {
      const config = sampleConfig()
      config.events!.fields.seats!.showIf = { field: 'visibility', in: ['public', 'typo'] }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("'typo' not in the options of 'visibility'"))).toBe(true)
   })

   it('rejects a conditional titleField', () => {
      const config = sampleConfig()
      config.events!.fields.title!.showIf = { field: 'visibility', eq: 'public' }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('the titleField cannot be conditional'))).toBe(true)
   })

   it('rejects showIf inside blocks', () => {
      const config = sampleConfig()
      config.events!.fields.body!.blocks!.hero!.fields.extra = {
         label: 'Extra',
         type: 'text',
         showIf: { field: 'heading', eq: 'x' },
      }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('showIf is not supported inside blocks'))).toBe(true)
   })
})

describe('a conditional field is never required outside the admin form', () => {
   function config() {
      const config = sampleConfig()
      config.events!.fields.seats!.required = true
      config.events!.fields.contactEmail!.required = true
      config.events!.fields.contactEmail!.showIf = { field: 'visibility', eq: 'public' }
      return config
   }

   it('reports required only for unconditional fields', () => {
      const fields = config().events!.fields
      expect(isRequiredField(fields.seats!)).toBe(true)
      expect(isRequiredField(fields.contactEmail!)).toBe(false)
   })

   it('leaves the column nullable', () => {
      const sql = renderSchemaFile(config(), 'sqlite')
      expect(sql).toContain("seats: integer('seats').notNull()")
      expect(sql).toContain("contactEmail: text('contact_email'),")
   })

   it('leaves the graphql field nullable', () => {
      const sdl = renderGraphqlSdl(config())
      expect(sdl).toContain('seats: Int!')
      expect(sdl).toContain('contactEmail: String\n')
   })

   it('leaves the generated type nullable', () => {
      const types = renderTypesFile(config())
      expect(types).toContain('seats: number\n')
      expect(types).toContain('contactEmail: string | null')
   })
})

describe('conditional required validation', () => {
   function schemaWith(field: string, showIf: unknown, required = true) {
      const config = sampleConfig().events!
      Object.assign(config.fields[field]!, { showIf, required })
      return buildEntrySchema(config, I18N)
   }

   function validEvent(overrides: Record<string, unknown> = {}) {
      return {
         title: 'Music Fest',
         slug: 'music-fest',
         description: { en: '<p>hello</p>' },
         seats: 100,
         date: '2026-08-01',
         featured: true,
         visibility: 'public',
         species: ['bass'],
         contactEmail: 'info@example.com',
         metadata: { any: 'thing' },
         poster: '2026/07/poster.png',
         brochure: { en: '2026/07/brochure-en.pdf' },
         body: [{ type: 'hero', heading: 'Welcome' }],
         category: 'categories_abc',
         tags: ['categories_abc'],
         status: 'draft',
         ...overrides,
      }
   }

   it('enforces required when the field is visible', () => {
      const schema = schemaWith('seats', { field: 'visibility', eq: 'public' })
      const result = schema.safeParse(validEvent({ visibility: 'public', seats: null }))
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.path).toEqual(['seats'])
   })

   it('skips required when the field is hidden', () => {
      const schema = schemaWith('seats', { field: 'visibility', eq: 'public' })
      expect(schema.safeParse(validEvent({ visibility: 'hidden', seats: null })).success).toBe(true)
   })

   it('accepts a filled visible field', () => {
      const schema = schemaWith('seats', { field: 'visibility', eq: 'public' })
      expect(schema.safeParse(validEvent({ visibility: 'public', seats: 10 })).success).toBe(true)
   })

   it('treats an empty string as missing on a visible field', () => {
      const schema = schemaWith('contactEmail', { field: 'visibility', eq: 'public' })
      const result = schema.safeParse(validEvent({ visibility: 'public', contactEmail: '' }))
      expect(result.success).toBe(false)
   })

   it('treats an empty blocks list as missing on a visible field', () => {
      const schema = schemaWith('body', { field: 'visibility', eq: 'public' })
      const result = schema.safeParse(validEvent({ visibility: 'public', body: null }))
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.path).toEqual(['body'])
   })

   it('keeps a hidden field value instead of clearing it', () => {
      const schema = schemaWith('seats', { field: 'visibility', eq: 'public' })
      const parsed = schema.parse(validEvent({ visibility: 'hidden', seats: 42 }))
      expect((parsed as { seats: number }).seats).toBe(42)
   })

   it('leaves optional conditional fields alone', () => {
      const schema = schemaWith('seats', { field: 'visibility', eq: 'public' }, false)
      expect(schema.safeParse(validEvent({ visibility: 'public', seats: null })).success).toBe(true)
   })
})
