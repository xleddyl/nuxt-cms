import type { SQL } from 'drizzle-orm'
import { and, eq, getTableColumns, getTableName, inArray, sql } from 'drizzle-orm'
import type { AnySQLiteColumn, BaseSQLiteDatabase, SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { CmsEntry, CmsPageRoute, FieldConfig } from '../../shared/index'
import {
   PAGE_PATH_FIELD,
   isMultiSelect,
   isTranslatableField,
   isTranslatableMediaField,
   pageAllFields,
   pageRowFields,
} from '../../shared/index'

export type PageDialect = 'sqlite' | 'postgres'

export type PageDb = Pick<
   BaseSQLiteDatabase<'sync' | 'async', unknown>,
   'select' | 'insert' | 'delete'
>

export interface PageTables {
   page: SQLiteTable
   fields: SQLiteTable
   media: SQLiteTable
}

export interface PageFieldRow {
   pageId: string
   key: string
   position: number
   value: string
}

export interface PageMediaRow {
   pageId: string
   key: string
   position: number
   mediaKey: string
}

export interface EncodedPage {
   columns: Record<string, unknown>
   fields: PageFieldRow[]
   media: PageMediaRow[]
   fieldKeys: string[]
   mediaKeys: string[]
}

type Row = Record<string, unknown>

type ChildRow = [string, number, string]

type ChildIndex = Map<string, Map<number, string>>

export const PAGE_BLOCK_TYPE_KEY = '_type'

const FIELDS_SELECTION = '$fields'
const MEDIA_SELECTION = '$media'
const INSERT_CHUNK = 20
const KEY_CHUNK = 90
const PLAIN_STRING_TYPES = new Set([
   'text',
   'richtext',
   'email',
   'slug',
   'date',
   'select',
   'relation',
])

function columnsOf(table: SQLiteTable) {
   return table as unknown as Record<string, AnySQLiteColumn>
}

function isPlainString(field: FieldConfig | undefined): boolean {
   return (
      !!field &&
      PLAIN_STRING_TYPES.has(field.type) &&
      !isTranslatableField(field) &&
      !isMultiSelect(field)
   )
}

function parseJson(raw: string): unknown {
   try {
      return JSON.parse(raw)
   } catch {
      return raw
   }
}

function encodeValue(field: FieldConfig | undefined, value: unknown): string {
   return isPlainString(field) ? String(value) : JSON.stringify(value)
}

function decodeValue(field: FieldConfig | undefined, raw: string): unknown {
   return isPlainString(field) ? raw : parseJson(raw)
}

function encodeMedia(value: unknown): string {
   return typeof value === 'string' ? value : JSON.stringify(value)
}

function decodeBlockMedia(field: FieldConfig, raw: string): unknown {
   return isTranslatableMediaField(field) && raw.startsWith('{') ? parseJson(raw) : raw
}

export function pageBlockKey(fieldKey: string, blockFieldKey: string) {
   return `${fieldKey}.${blockFieldKey}`
}

function blockOwnedKeys(key: string, field: FieldConfig) {
   const fields = new Set([pageBlockKey(key, PAGE_BLOCK_TYPE_KEY)])
   const media = new Set<string>()
   for (const block of Object.values(field.blocks ?? {})) {
      for (const [blockFieldKey, blockField] of Object.entries(block.fields)) {
         const blockKey = pageBlockKey(key, blockFieldKey)
         if (blockField.type === 'media') media.add(blockKey)
         else fields.add(blockKey)
      }
   }
   return { fields: [...fields], media: [...media] }
}

export function encodePageRows(entry: CmsEntry, pageId: string, values: Row): EncodedPage {
   const rowFields = pageRowFields(entry)
   const encoded: EncodedPage = { columns: {}, fields: [], media: [], fieldKeys: [], mediaKeys: [] }
   const pushField = (key: string, position: number, value: string) =>
      encoded.fields.push({ pageId, key, position, value })
   const pushMedia = (key: string, position: number, value: unknown) =>
      encoded.media.push({ pageId, key, position, mediaKey: encodeMedia(value) })

   for (const [key, value] of Object.entries(values)) {
      const field = rowFields[key]
      if (!field) {
         encoded.columns[key] = value
         continue
      }
      if (field.type === 'blocks') {
         const owned = blockOwnedKeys(key, field)
         encoded.fieldKeys.push(...owned.fields)
         encoded.mediaKeys.push(...owned.media)
         if (!Array.isArray(value)) continue
         value.forEach((item: Row, position) => {
            const type = String(item.type)
            const block = field.blocks?.[type]
            pushField(pageBlockKey(key, PAGE_BLOCK_TYPE_KEY), position, type)
            for (const [blockFieldKey, blockValue] of Object.entries(item)) {
               if (blockFieldKey === 'type' || blockValue == null) continue
               const blockField = block?.fields[blockFieldKey]
               const blockKey = pageBlockKey(key, blockFieldKey)
               if (blockField?.type === 'media') pushMedia(blockKey, position, blockValue)
               else pushField(blockKey, position, encodeValue(blockField, blockValue))
            }
         })
         continue
      }
      if (field.type === 'media') {
         encoded.mediaKeys.push(key)
         if (value != null) pushMedia(key, 0, value)
         continue
      }
      encoded.fieldKeys.push(key)
      if (value != null) pushField(key, 0, encodeValue(field, value))
   }
   return encoded
}

function parseChildren(value: unknown): ChildRow[] {
   if (value == null) return []
   const rows = typeof value === 'string' ? parseJson(value) : value
   return Array.isArray(rows) ? (rows as ChildRow[]) : []
}

function indexChildren(rows: ChildRow[]): ChildIndex {
   const index: ChildIndex = new Map()
   for (const [key, position, value] of rows) {
      if (key == null || value == null) continue
      let positions = index.get(key)
      if (!positions) {
         positions = new Map()
         index.set(key, positions)
      }
      positions.set(Number(position), String(value))
   }
   return index
}

function decodeBlocks(key: string, field: FieldConfig, fields: ChildIndex, media: ChildIndex) {
   const types = fields.get(pageBlockKey(key, PAGE_BLOCK_TYPE_KEY))
   if (!types?.size) return null
   return [...types.entries()]
      .sort(([a], [b]) => a - b)
      .map(([position, type]) => {
         const item: Row = { type }
         for (const [blockFieldKey, blockField] of Object.entries(
            field.blocks?.[type]?.fields ?? {}
         )) {
            const blockKey = pageBlockKey(key, blockFieldKey)
            if (blockField.type === 'media') {
               const raw = media.get(blockKey)?.get(position)
               item[blockFieldKey] = raw == null ? null : decodeBlockMedia(blockField, raw)
               continue
            }
            const raw = fields.get(blockKey)?.get(position)
            item[blockFieldKey] = raw == null ? null : decodeValue(blockField, raw)
         }
         return item
      })
}

function decodeRowField(key: string, field: FieldConfig, fields: ChildIndex, media: ChildIndex) {
   if (field.type === 'blocks') return decodeBlocks(key, field, fields, media)
   if (field.type === 'media') return media.get(key)?.get(0) ?? null
   const raw = fields.get(key)?.get(0)
   return raw == null ? null : decodeValue(field, raw)
}

export function decodePageRow(entry: CmsEntry, row: Row): Row {
   const rowFields = pageRowFields(entry)
   const fields = indexChildren(parseChildren(row[FIELDS_SELECTION]))
   const media = indexChildren(parseChildren(row[MEDIA_SELECTION]))
   const result: Row = { id: row.id, [PAGE_PATH_FIELD]: row[PAGE_PATH_FIELD] }
   for (const [key, field] of Object.entries(pageAllFields(entry))) {
      result[key] = Object.hasOwn(rowFields, key)
         ? decodeRowField(key, field, fields, media)
         : row[key] ?? null
   }
   for (const [key, value] of Object.entries(row)) {
      if (key === FIELDS_SELECTION || key === MEDIA_SELECTION || Object.hasOwn(result, key))
         continue
      result[key] = value
   }
   return result
}

export function decodePageRows(entry: CmsEntry, rows: Row[]): Row[] {
   return rows.map((row) => decodePageRow(entry, row))
}

function qualified(table: SQLiteTable, column: AnySQLiteColumn): SQL {
   return sql`${sql.identifier(getTableName(table))}.${sql.identifier(column.name)}`
}

function childAggregate(
   dialect: PageDialect,
   page: SQLiteTable,
   table: SQLiteTable,
   valueKey: string
): SQL {
   const columns = columnsOf(table)
   const owner = qualified(table, columns.pageId!)
   const key = qualified(table, columns.key!)
   const position = qualified(table, columns.position!)
   const value = qualified(table, columns[valueKey]!)
   const pageId = qualified(page, columnsOf(page).id!)
   const from = sql.identifier(getTableName(table))
   return dialect === 'postgres'
      ? sql`(select coalesce(json_agg(json_build_array(${key}, ${position}, ${value})), '[]'::json) from ${from} where ${owner} = ${pageId})`
      : sql`(select json_group_array(json_array(${key}, ${position}, ${value})) from ${from} where ${owner} = ${pageId})`
}

export function pageSelection(dialect: PageDialect, tables: PageTables) {
   return {
      ...getTableColumns(tables.page),
      [FIELDS_SELECTION]: childAggregate(dialect, tables.page, tables.fields, 'value'),
      [MEDIA_SELECTION]: childAggregate(dialect, tables.page, tables.media, 'mediaKey'),
   }
}

export function selectPages(db: PageDb, dialect: PageDialect, tables: PageTables) {
   return db.select(pageSelection(dialect, tables)).from(tables.page).$dynamic()
}

function chunks<T>(items: T[], size: number): T[][] {
   const out: T[][] = []
   for (let index = 0; index < items.length; index += size) {
      out.push(items.slice(index, index + size))
   }
   return out
}

export function pageWriteStatements(
   db: PageDb,
   dialect: PageDialect,
   tables: PageTables,
   entry: CmsEntry,
   route: Pick<CmsPageRoute, 'key' | 'path'>,
   values: Row
): PromiseLike<unknown>[] {
   const encoded = encodePageRows(entry, route.key, values)
   const pageId = columnsOf(tables.page).id!
   const fieldColumns = columnsOf(tables.fields)
   const mediaColumns = columnsOf(tables.media)
   const set = encoded.columns
   const statements: PromiseLike<unknown>[] = [
      db
         .insert(tables.page)
         .values({ ...set, id: route.key, [PAGE_PATH_FIELD]: route.path } as Row)
         .onConflictDoUpdate({ target: pageId, set }),
   ]
   for (const keys of chunks(encoded.fieldKeys, KEY_CHUNK)) {
      statements.push(
         db
            .delete(tables.fields)
            .where(and(eq(fieldColumns.pageId!, route.key), inArray(fieldColumns.key!, keys)))
      )
   }
   for (const keys of chunks(encoded.mediaKeys, KEY_CHUNK)) {
      statements.push(
         db
            .delete(tables.media)
            .where(and(eq(mediaColumns.pageId!, route.key), inArray(mediaColumns.key!, keys)))
      )
   }
   for (const rows of chunks(encoded.fields, INSERT_CHUNK)) {
      statements.push(db.insert(tables.fields).values(rows))
   }
   for (const rows of chunks(encoded.media, INSERT_CHUNK)) {
      statements.push(db.insert(tables.media).values(rows))
   }
   statements.push(selectPages(db, dialect, tables).where(eq(pageId, route.key)).limit(1))
   return statements
}
