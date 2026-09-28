import { inArray } from 'drizzle-orm'
import type { AnySQLiteColumn, BaseSQLiteDatabase, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { createError } from 'h3'
import type { CmsEntry, FieldConfig, MediaUsage } from '../../shared/index'
import { PAGE_PATH_FIELD, pageFields, pageRouteOf } from '../../shared/index'

export interface MediaReference {
   field: string
   key: string
}

export type MediaLookup = (keys: string[]) => Promise<Set<string>>

const LOOKUP_CHUNK = 90

function mediaKeysOf(value: unknown): string[] {
   if (typeof value === 'string') return value ? [value] : []
   if (!value || typeof value !== 'object') return []
   return Object.values(value as Record<string, unknown>).filter(
      (key): key is string => typeof key === 'string' && key !== ''
   )
}

export function mediaReferences(
   fields: Record<string, FieldConfig>,
   values: Record<string, unknown>
): MediaReference[] {
   const references: MediaReference[] = []
   for (const [key, field] of Object.entries(fields)) {
      const value = values[key]
      if (field.type === 'media') {
         for (const mediaKey of mediaKeysOf(value)) references.push({ field: key, key: mediaKey })
         continue
      }
      if (field.type !== 'blocks' || !Array.isArray(value)) continue
      value.forEach((item: Record<string, unknown> | null, index) => {
         const block = item ? field.blocks?.[String(item.type)] : undefined
         for (const [blockFieldKey, blockField] of Object.entries(block?.fields ?? {})) {
            if (blockField.type !== 'media') continue
            for (const mediaKey of mediaKeysOf(item?.[blockFieldKey])) {
               references.push({ field: `${key}[${index}].${blockFieldKey}`, key: mediaKey })
            }
         }
      })
   }
   return references
}

export interface MediaUsageSource {
   name: string
   entry: CmsEntry
   rows: Record<string, unknown>[]
}

function titleOf(entry: CmsEntry, row: Record<string, unknown>): string | null {
   if (entry.kind === 'page') {
      const path = row[PAGE_PATH_FIELD]
      return pageRouteOf(entry, String(row.id))?.label ?? (typeof path === 'string' ? path : null)
   }
   const value = entry.titleField ? row[entry.titleField] : undefined
   if (typeof value === 'string') return value || null
   if (value && typeof value === 'object') {
      const first = Object.values(value).find(
         (candidate): candidate is string => typeof candidate === 'string' && candidate !== ''
      )
      return first ?? null
   }
   return null
}

function fieldsOf(entry: CmsEntry, row: Record<string, unknown>) {
   const path = row[PAGE_PATH_FIELD]
   return entry.kind === 'page' && typeof path === 'string' ? pageFields(entry, path) : entry.fields
}

export function collectMediaUsage(
   sources: MediaUsageSource[],
   keys: string[]
): Record<string, MediaUsage[]> {
   const usage: Record<string, MediaUsage[]> = Object.fromEntries(keys.map((key) => [key, []]))
   for (const { name, entry, rows } of sources) {
      for (const row of rows) {
         for (const reference of mediaReferences(fieldsOf(entry, row), row)) {
            const list = usage[reference.key]
            if (!list) continue
            list.push({
               collection: name,
               label: entry.label,
               kind: entry.kind,
               id: entry.kind === 'single' ? null : String(row.id),
               title: titleOf(entry, row),
               field: reference.field,
            })
         }
      }
   }
   return usage
}

export async function assertKnownMedia(references: MediaReference[], lookup: MediaLookup) {
   if (!references.length) return
   const known = await lookup([...new Set(references.map((reference) => reference.key))])
   const missing = references.filter((reference) => !known.has(reference.key))
   if (!missing.length) return
   throw createError({
      statusCode: 400,
      statusMessage: `Media not found in the library: ${missing
         .map((reference) => `'${reference.key}' (${reference.field})`)
         .join(', ')}`,
   })
}

export async function mediaKeysInTable(
   db: Pick<BaseSQLiteDatabase<'sync' | 'async', unknown>, 'select'>,
   table: SQLiteTable,
   keys: string[]
): Promise<Set<string>> {
   const column = (table as unknown as Record<string, AnySQLiteColumn>).key!
   const found = new Set<string>()
   for (let index = 0; index < keys.length; index += LOOKUP_CHUNK) {
      const rows = (await db
         .select({ key: column })
         .from(table)
         .where(inArray(column, keys.slice(index, index + LOOKUP_CHUNK)))) as { key: string }[]
      for (const row of rows) found.add(row.key)
   }
   return found
}
