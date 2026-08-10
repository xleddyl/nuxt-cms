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
      species: ['bass', 'trout'],
      contactEmail: 'info@example.com',
      metadata: { any: 'thing' },
      poster: '2026/07/poster.png',
      brochure: { en: '2026/07/brochure-en.pdf', it: '2026/07/brochure-it.pdf' },
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

   it('accepts a valid multi-select array', () => {
      expect(schema.safeParse({ ...validEvent(), species: ['pike'] }).success).toBe(true)
   })

   it('normalizes omitted multi-select fields to empty arrays', () => {
      const entry = validEvent() as Record<string, unknown>
      delete entry.species
      expect(schema.parse(entry).species).toEqual([])
   })

   it('rejects a multi-select array containing an unknown option', () => {
      expect(schema.safeParse({ ...validEvent(), species: ['shark'] }).success).toBe(false)
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

   it('validates translatable fields inside blocks as locale maps', () => {
      const config = sampleConfig().events!
      config.fields.body!.blocks!.hero!.fields.heading!.translatable = true
      const translatable = buildEntrySchema(config, I18N)

      expect(
         translatable.safeParse({
            ...validEvent(),
            body: [{ type: 'hero', heading: { en: 'Welcome', it: 'Benvenuto' } }],
         }).success
      ).toBe(true)
      expect(
         translatable.safeParse({ ...validEvent(), body: [{ type: 'hero', heading: 'Welcome' }] })
            .success
      ).toBe(false)
   })

   it('rejects unknown locales inside blocks', () => {
      const config = sampleConfig().events!
      config.fields.body!.blocks!.hero!.fields.heading!.translatable = true
      const translatable = buildEntrySchema(config, I18N)

      expect(
         translatable.safeParse({
            ...validEvent(),
            body: [{ type: 'hero', heading: { en: 'Welcome', fr: 'Bienvenue' } }],
         }).success
      ).toBe(false)
   })

   it('requires the default locale on a required translatable block field', () => {
      const config = sampleConfig().events!
      config.fields.body!.blocks!.hero!.fields.heading!.translatable = true
      const translatable = buildEntrySchema(config, I18N)

      expect(
         translatable.safeParse({
            ...validEvent(),
            body: [{ type: 'hero', heading: { it: 'Benvenuto' } }],
         }).success
      ).toBe(false)
   })

   it('validates translatable media keys inside blocks', () => {
      const config = sampleConfig().events!
      config.fields.body!.blocks!.hero!.fields.image = {
         label: 'Image',
         type: 'media',
         translatable: true,
      }
      const translatable = buildEntrySchema(config, I18N)

      expect(
         translatable.safeParse({
            ...validEvent(),
            body: [{ type: 'hero', heading: 'Welcome', image: { en: '2026/07/hero.png' } }],
         }).success
      ).toBe(true)
      expect(
         translatable.safeParse({
            ...validEvent(),
            body: [{ type: 'hero', heading: 'Welcome', image: { en: '../etc/passwd' } }],
         }).success
      ).toBe(false)
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

   it('accepts a partial locale map on a translatable media field', () => {
      const parsed = schema.parse({ ...validEvent(), brochure: { it: '2026/07/only-it.pdf' } })
      expect(parsed.brochure).toEqual({ it: '2026/07/only-it.pdf' })
   })

   it('normalizes an omitted translatable media field to null', () => {
      const entry = validEvent() as Record<string, unknown>
      delete entry.brochure
      expect(schema.parse(entry).brochure).toBeNull()
   })

   it('rejects unknown locale keys on translatable media fields', () => {
      expect(schema.safeParse({ ...validEvent(), brochure: { fr: 'a.pdf' } }).success).toBe(false)
   })

   it('rejects translatable media keys with path traversal', () => {
      expect(schema.safeParse({ ...validEvent(), brochure: { en: '../etc/passwd' } }).success).toBe(
         false
      )
   })

   it('requires the default locale on required translatable media fields', () => {
      const config = sampleConfig().events!
      config.fields.brochure!.required = true
      const strict = buildEntrySchema(config, I18N)
      expect(strict.safeParse({ ...validEvent(), brochure: { it: 'a.pdf' } }).success).toBe(false)
      expect(strict.safeParse({ ...validEvent(), brochure: { en: 'a.pdf' } }).success).toBe(true)
   })
})
