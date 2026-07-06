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
      expect(out).toContain("date: date('date', { mode: 'string' }).notNull()")
      expect(out).toContain("featured: boolean('featured')")
      expect(out).toContain("createdAt: timestamp('created_at', { mode: 'string' })")
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
