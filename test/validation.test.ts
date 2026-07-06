import { describe, expect, it } from 'vitest'
import { buildEntrySchema } from '../src/runtime/shared/validation'
import { I18N, sampleConfig } from './fixtures'

const events = sampleConfig().events!

function validEvent() {
   return {
      title: 'Music Fest',
      slug: 'music-fest',
      description: { en: '<p>hello</p>' },
      seats: 100,
      date: '2026-08-01',
      featured: true,
      visibility: 'public',
      contactEmail: 'info@example.com',
      metadata: { any: 'thing' },
      poster: '2026/07/poster.png',
      body: [{ type: 'hero', heading: 'Welcome' }],
      category: 'categories_abc',
      tags: ['categories_abc'],
      status: 'draft',
   }
}

describe('buildEntrySchema', () => {
   const schema = buildEntrySchema(events, I18N)

   it('accepts a valid entry', () => {
      expect(() => schema.parse(validEvent())).not.toThrow()
   })

   it('rejects an empty required text field', () => {
      expect(schema.safeParse({ ...validEvent(), title: '' }).success).toBe(false)
   })

   it('normalizes omitted optional fields to null', () => {
      const entry = validEvent() as Record<string, unknown>
      delete entry.seats
      delete entry.featured
      const parsed = schema.parse(entry)
      expect(parsed.seats).toBeNull()
      expect(parsed.featured).toBeNull()
   })

   it('rejects non-integer values for integer fields', () => {
      expect(schema.safeParse({ ...validEvent(), seats: 1.5 }).success).toBe(false)
   })

   it('rejects malformed dates', () => {
      expect(schema.safeParse({ ...validEvent(), date: '2026-8-1' }).success).toBe(false)
   })

   it('rejects invalid emails', () => {
      expect(schema.safeParse({ ...validEvent(), contactEmail: 'nope' }).success).toBe(false)
   })

   it('rejects invalid slugs', () => {
      expect(schema.safeParse({ ...validEvent(), slug: 'Not A Slug' }).success).toBe(false)
   })

   it('rejects values outside the select options', () => {
      expect(schema.safeParse({ ...validEvent(), visibility: 'secret' }).success).toBe(false)
   })

   it('rejects unknown locale keys on translatable fields', () => {
      const result = schema.safeParse({ ...validEvent(), description: { fr: 'bonjour' } })
      expect(result.success).toBe(false)
   })

   it('requires the default locale on required translatable fields', () => {
      const config = sampleConfig().events!
      config.fields.description!.required = true
      const strict = buildEntrySchema(config, I18N)
      expect(strict.safeParse({ ...validEvent(), description: { it: 'ciao' } }).success).toBe(false)
      expect(strict.safeParse({ ...validEvent(), description: { en: 'hi' } }).success).toBe(true)
   })

   it('rejects blocks with an unknown type', () => {
      const result = schema.safeParse({ ...validEvent(), body: [{ type: 'nope', heading: 'x' }] })
      expect(result.success).toBe(false)
   })

   it('validates required fields inside blocks', () => {
      const result = schema.safeParse({ ...validEvent(), body: [{ type: 'hero', heading: '' }] })
      expect(result.success).toBe(false)
   })

   it('normalizes omitted many-to-many lists to empty arrays', () => {
      const entry = validEvent() as Record<string, unknown>
      delete entry.tags
      expect(schema.parse(entry).tags).toEqual([])
   })

   it('rejects invalid status values when drafts are enabled', () => {
      expect(schema.safeParse({ ...validEvent(), status: 'archived' }).success).toBe(false)
   })

   it('rejects media keys with path traversal', () => {
      expect(schema.safeParse({ ...validEvent(), poster: '../etc/passwd' }).success).toBe(false)
   })
})
