import type { SQL } from 'drizzle-orm'
import { desc, inArray, or, sql } from 'drizzle-orm'
import type { AnySQLiteColumn, BaseSQLiteDatabase, SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { CmsConfig, CmsEntry, CmsI18n, FieldConfig } from '../../shared/index'
import {
   decodeTranslatableValue,
   isMultiSelect,
   isTranslatableField,
   mediaFilename,
   pageColumnFields,
   pageFields,
   pageFieldsTableName,
   pageMediaTableName,
   pageRouteOf,
} from '../../shared/index'
import type { CmsSearchHit, CmsSearchResponse, CmsSearchSnippet } from '../../shared/search'
import {
   CMS_SEARCH_HITS_PER_ROW,
   CMS_SEARCH_MIN_LENGTH,
   CMS_SEARCH_ROWS_PER_ENTRY,
   CMS_SEARCH_VALUE_LIMIT,
   cmsSearchLink,
   normalizeSearchQuery,
   searchCmsLabels,
   searchFieldPath,
   searchLikePattern,
   searchSnippet,
   stripMarkup,
} from '../../shared/search'
import type { PageDb } from './page-rows'
import { decodePageRows, selectPages } from './page-rows'

export type SearchDb = Pick<
   BaseSQLiteDatabase<'sync' | 'async', unknown>,
   'select' | 'selectDistinct'
>

export type SearchDialect = 'sqlite' | 'postgres'

export interface CmsSearchOptions {
   db: SearchDb
   dialect: SearchDialect
   config: CmsConfig
   tables: Record<string, unknown>
   i18n: CmsI18n
   query: string
}

type Row = Record<string, unknown>

interface FieldText {
   locale: string | null
   text: string
}

interface RowHit {
   field: string
   block: number | null
   fieldLabel: string
   locale: string | null
   snippet: CmsSearchSnippet
}

interface SearchContext extends CmsSearchOptions {
   term: string
   pattern: string
}

const VALUE_TYPES = new Set(['text', 'richtext', 'email', 'slug', 'select', 'json', 'blocks'])

function isSearchableField(field: FieldConfig): boolean {
   return VALUE_TYPES.has(field.type)
}

function columnsOf(table: SQLiteTable) {
   return table as unknown as Record<string, AnySQLiteColumn>
}

function tableOf(context: SearchContext, name: string): SQLiteTable | undefined {
   const entry = context.config[name]
   return (entry?.table ?? context.tables[name]) as SQLiteTable | undefined
}

export function searchLikeCondition(
   dialect: SearchDialect,
   column: AnySQLiteColumn,
   pattern: string
): SQL {
   const text = dialect === 'postgres' ? sql`cast(${column} as text)` : sql`${column}`
   return sql`lower(${text}) like ${pattern} escape '\\'`
}

function plainText(field: FieldConfig, value: string): string {
   return field.type === 'richtext' ? stripMarkup(value) : value
}

function fieldTexts(field: FieldConfig, value: unknown, defaultLocale: string): FieldText[] {
   if (value == null || value === '') return []
   if (isTranslatableField(field)) {
      return Object.entries(decodeTranslatableValue(value, defaultLocale) ?? {})
         .filter((pair): pair is [string, string] => typeof pair[1] === 'string' && !!pair[1])
         .map(([locale, text]) => ({ locale, text: plainText(field, text) }))
   }
   if (isMultiSelect(field) && Array.isArray(value)) {
      return [{ locale: null, text: value.map(String).join(', ') }]
   }
   if (typeof value === 'string') return [{ locale: null, text: plainText(field, value) }]
   return [{ locale: null, text: JSON.stringify(value) }]
}

function rowHits(
   fields: Record<string, FieldConfig>,
   row: Row,
   term: string,
   defaultLocale: string
): RowHit[] {
   const hits: RowHit[] = []
   const collect = (
      field: FieldConfig,
      value: unknown,
      hit: Omit<RowHit, 'locale' | 'snippet'>
   ) => {
      for (const { locale, text } of fieldTexts(field, value, defaultLocale)) {
         if (hits.length >= CMS_SEARCH_HITS_PER_ROW) return
         const snippet = searchSnippet(text, term)
         if (snippet) hits.push({ ...hit, locale, snippet })
      }
   }
   for (const [key, field] of Object.entries(fields)) {
      if (hits.length >= CMS_SEARCH_HITS_PER_ROW) break
      if (!isSearchableField(field)) continue
      const value = row[key]
      if (field.type !== 'blocks') {
         collect(field, value, { field: key, block: null, fieldLabel: field.label })
         continue
      }
      if (!Array.isArray(value)) continue
      value.forEach((item: Row | null, index) => {
         const block = item ? field.blocks?.[String(item.type)] : undefined
         if (!item || !block) return
         for (const [blockKey, blockField] of Object.entries(block.fields)) {
            if (!isSearchableField(blockField)) continue
            collect(blockField, item[blockKey], {
               field: key,
               block: index,
               fieldLabel: searchFieldPath(field.label, block.label, blockField.label),
            })
         }
      })
   }
   return hits
}

function titleOf(entry: CmsEntry, row: Row, defaultLocale: string): string | null {
   if (entry.kind === 'single' || !entry.titleField) return null
   const value = row[entry.titleField]
   if (value == null) return null
   if (typeof value === 'object') {
      const values = value as Record<string, unknown>
      const text = [values[defaultLocale], ...Object.values(values)].find(
         (candidate): candidate is string => typeof candidate === 'string' && !!candidate
      )
      return text ?? null
   }
   return String(value) || null
}

async function tableRows(context: SearchContext, entry: CmsEntry, table: SQLiteTable) {
   const columns = columnsOf(table)
   const conditions = Object.entries(entry.fields)
      .filter(([key, field]) => isSearchableField(field) && Object.hasOwn(columns, key))
      .map(([key]) => searchLikeCondition(context.dialect, columns[key]!, context.pattern))
   if (!conditions.length) return []
   const query = context.db
      .select()
      .from(table)
      .where(or(...conditions))
   const ordered = columns.updatedAt ? query.orderBy(desc(columns.updatedAt)) : query
   return (await ordered.limit(CMS_SEARCH_ROWS_PER_ENTRY)) as Row[]
}

async function pageRows(
   context: SearchContext,
   name: string,
   entry: CmsEntry,
   table: SQLiteTable
): Promise<Row[]> {
   const fields = tableOf(context, pageFieldsTableName(name))
   const media = tableOf(context, pageMediaTableName(name))
   if (!fields || !media) return []
   const pageColumns = columnsOf(table)
   const fieldColumns = columnsOf(fields)
   const matched = (await context.db
      .selectDistinct({ id: fieldColumns.pageId! })
      .from(fields)
      .where(searchLikeCondition(context.dialect, fieldColumns.value!, context.pattern))
      .limit(CMS_SEARCH_ROWS_PER_ENTRY)) as { id: string }[]
   const conditions = Object.entries(pageColumnFields(entry))
      .filter(([key, field]) => isSearchableField(field) && Object.hasOwn(pageColumns, key))
      .map(([key]) => searchLikeCondition(context.dialect, pageColumns[key]!, context.pattern))
   if (conditions.length) {
      matched.push(
         ...((await context.db
            .select({ id: pageColumns.id! })
            .from(table)
            .where(or(...conditions))
            .limit(CMS_SEARCH_ROWS_PER_ENTRY)) as { id: string }[])
      )
   }
   const ids = [...new Set(matched.map((row) => String(row.id)))].slice(
      0,
      CMS_SEARCH_ROWS_PER_ENTRY
   )
   if (!ids.length) return []
   const rows = (await selectPages(context.db as unknown as PageDb, context.dialect, {
      page: table,
      fields,
      media,
   }).where(inArray(pageColumns.id!, ids))) as Row[]
   return decodePageRows(entry, rows)
}

function itemPath(name: string, entry: CmsEntry, row: Row): string | null {
   if (entry.kind === 'single') return `/cms/${name}`
   if (entry.kind === 'page') {
      const route = pageRouteOf(entry, String(row.id))
      return route ? `/cms/${name}/${route.key}` : null
   }
   return row.id == null ? null : `/cms/${name}/${String(row.id)}`
}

function entryHits(
   context: SearchContext,
   name: string,
   entry: CmsEntry,
   rows: Row[]
): CmsSearchHit[] {
   const { defaultLocale } = context.i18n
   const hits: CmsSearchHit[] = []
   for (const row of rows) {
      const path = itemPath(name, entry, row)
      if (!path) continue
      const route = entry.kind === 'page' ? pageRouteOf(entry, String(row.id)) : undefined
      const fields = route ? pageFields(entry, route.path) : entry.fields
      const title = route ? route.label : titleOf(entry, row, defaultLocale)
      for (const hit of rowHits(fields, row, context.term, defaultLocale)) {
         hits.push({
            type: 'value',
            collection: name,
            entryLabel: entry.label,
            kind: entry.kind,
            id: entry.kind === 'single' ? null : String(row.id),
            title,
            field: hit.field,
            fieldLabel: hit.fieldLabel,
            locale: hit.locale,
            snippet: hit.snippet,
            to: cmsSearchLink(path, {
               field: hit.field,
               locale: hit.locale,
               block: hit.block,
            }),
         })
      }
   }
   return hits
}

async function mediaHits(context: SearchContext): Promise<CmsSearchHit[]> {
   const table = context.tables.cms_media as SQLiteTable | undefined
   const columns = table ? columnsOf(table) : undefined
   if (!table || !columns?.alt || !columns.key || !columns.folder) return []
   const rows = (await context.db
      .select({ key: columns.key, alt: columns.alt, folder: columns.folder })
      .from(table)
      .where(searchLikeCondition(context.dialect, columns.alt, context.pattern))
      .limit(CMS_SEARCH_ROWS_PER_ENTRY)) as {
      key: string
      alt: string | null
      folder: string | null
   }[]
   return rows.flatMap((row) => {
      const snippet = row.alt ? searchSnippet(row.alt, context.term) : null
      if (!snippet) return []
      const folder = row.folder ?? ''
      return [
         {
            type: 'media',
            collection: null,
            entryLabel: 'Media',
            kind: 'media',
            id: row.key,
            title: mediaFilename(row.key),
            field: 'alt',
            fieldLabel: 'Alt text',
            locale: null,
            snippet,
            to: folder ? `/cms/media?${new URLSearchParams({ folder })}` : '/cms/media',
         } satisfies CmsSearchHit,
      ]
   })
}

export async function searchCmsValues(
   options: CmsSearchOptions
): Promise<{ hits: CmsSearchHit[]; truncated: boolean }> {
   const term = normalizeSearchQuery(options.query)
   if (term.length < CMS_SEARCH_MIN_LENGTH) return { hits: [], truncated: false }
   const context: SearchContext = {
      ...options,
      term,
      pattern: searchLikePattern(term.toLowerCase()),
   }
   const hits: CmsSearchHit[] = []
   let truncated = false
   for (const [name, entry] of Object.entries(options.config)) {
      const table = tableOf(context, name)
      if (!table) continue
      const rows =
         entry.kind === 'page'
            ? await pageRows(context, name, entry, table)
            : await tableRows(context, entry, table)
      if (rows.length >= CMS_SEARCH_ROWS_PER_ENTRY) truncated = true
      hits.push(...entryHits(context, name, entry, rows))
   }
   const media = await mediaHits(context)
   if (media.length >= CMS_SEARCH_ROWS_PER_ENTRY) truncated = true
   hits.push(...media)
   if (hits.length > CMS_SEARCH_VALUE_LIMIT) truncated = true
   return { hits: hits.slice(0, CMS_SEARCH_VALUE_LIMIT), truncated }
}

export async function searchCms(options: CmsSearchOptions): Promise<CmsSearchResponse> {
   const query = normalizeSearchQuery(options.query)
   if (query.length < CMS_SEARCH_MIN_LENGTH) return { query, hits: [], truncated: false }
   const labels = searchCmsLabels(options.config, query)
   const values = await searchCmsValues({ ...options, query })
   return {
      query,
      hits: [...labels.hits, ...values.hits],
      truncated: labels.truncated || values.truncated,
   }
}
