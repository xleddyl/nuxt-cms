import { describe, expect, it } from 'vitest'
import { renderSchemaFile } from '../src/schema-codegen'
import { sampleConfig } from './fixtures'

describe('renderSchemaFile', () => {
   it('renders a sqlite schema', () => {
      const out = renderSchemaFile(sampleConfig(), 'sqlite')
      expect(out).toContain("import { sql } from 'drizzle-orm'")
      expect(out).toContain("export const events = sqliteTable('events'")
      expect(out).toContain("export const cms_media = sqliteTable('cms_media'")
      expect(out).toContain("title: text('title').notNull()")
      expect(out).toContain("slug: text('slug').unique().notNull()")
      expect(out).toContain("description: text('description', { mode: 'json' })")
      expect(out).toContain("species: text('species', { mode: 'json' })")
      expect(out).toContain("poster: text('poster')")
      expect(out).toContain("brochure: text('brochure')")
      expect(out).toContain("seats: integer('seats')")
      expect(out).toContain("featured: integer('featured', { mode: 'boolean' })")
      expect(out).toContain(
         "category: text('category').references(() => categories.id, { onDelete: 'set null' })"
      )
      expect(out).toContain("status: text('status').notNull().default('draft')")
      expect(out).toContain("export const events_tags = sqliteTable('events_tags'")
      expect(out).toContain('primaryKey({ columns: [table.sourceId, table.targetId] })')
      expect(out).not.toContain("tags: text('tags')")
   })

   it('renders a postgres schema', () => {
      const out = renderSchemaFile(sampleConfig(), 'postgres')
      expect(out).toContain("export const events = pgTable('events'")
      expect(out).not.toContain('import { sql }')
      expect(out).toContain("description: jsonb('description')")
      expect(out).toContain("species: jsonb('species')")
      expect(out).toContain("date: date('date', { mode: 'string' }).notNull()")
      expect(out).toContain("featured: boolean('featured')")
      expect(out).toContain("createdAt: timestamp('created_at', { mode: 'string' })")
      expect(out).toMatch(/import \{ [^}]*\bjsonb\b[^}]* \} from 'drizzle-orm\/pg-core'/)
   })

   it('keeps translatable media on a plain text column in both dialects', () => {
      const plain = sampleConfig()
      const translatable = sampleConfig()
      translatable.events!.fields.poster!.translatable = true
      for (const dialect of ['sqlite', 'postgres'] as const) {
         const before = renderSchemaFile(plain, dialect)
         const after = renderSchemaFile(translatable, dialect)
         expect(after).toBe(before)
         expect(after).toContain("poster: text('poster')")
      }
   })

   it('does not pull in jsonb for a postgres schema whose only translatable field is media', () => {
      const config = sampleConfig()
      delete config.events!.fields.description
      delete config.events!.fields.metadata
      delete config.events!.fields.species
      delete config.events!.fields.body
      delete config.homepage!.fields.heroTitle
      config.homepage!.fields.tagline = { label: 'Tagline', type: 'text' }
      const out = renderSchemaFile(config, 'postgres')
      expect(out).toContain("brochure: text('brochure')")
      expect(out).not.toContain('jsonb')
   })

   it('marks required relations as restrict by default', () => {
      const config = sampleConfig()
      config.events!.fields.category!.required = true
      const out = renderSchemaFile(config, 'sqlite')
      expect(out).toContain(
         "category: text('category').references(() => categories.id, { onDelete: 'restrict' }).notNull()"
      )
   })

   it('routes imports through the resolver', () => {
      const out = renderSchemaFile(sampleConfig(), 'sqlite', (s) => `/abs/${s}`)
      expect(out).toContain("from '/abs/drizzle-orm/sqlite-core'")
   })
})
