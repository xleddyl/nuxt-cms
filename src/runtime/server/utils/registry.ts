import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { H3Event } from 'h3'
import { createError, getRouterParam } from 'h3'
import { z } from 'zod'
import cmsConfig from '#cms-config'
import * as cmsTables from '#cms-tables'
import { useRuntimeConfig } from '#imports'
import type { CmsEntry, CmsI18n, CmsPageRoute } from '../../shared/index'
import {
   CONTENT_PUBLISHED_AT_FIELD,
   decodeEntryTranslatableMedia,
   encodeEntryTranslatableMedia,
   pageFields,
   pageRouteOf,
} from '../../shared/index'
import { normalizeTimestampFields, nowTimestamp } from '../../shared/timestamps'
import { buildEntrySchema } from '../../shared/validation'

let contentI18n: CmsI18n | undefined

export function getContentI18n(): CmsI18n {
   if (!contentI18n) {
      const { i18n } = (useRuntimeConfig().public.cms ?? {}) as { i18n?: CmsI18n }
      contentI18n = { locales: i18n?.locales ?? [], defaultLocale: i18n?.defaultLocale ?? 'en' }
   }
   return contentI18n
}

export function resolveTable(name: string): SQLiteTable | undefined {
   const entry = (cmsConfig as Record<string, CmsEntry>)[name]
   return (entry?.table ?? (cmsTables as Record<string, unknown>)[name]) as SQLiteTable | undefined
}

export function tableColumns(table: SQLiteTable) {
   return table as unknown as Record<string, AnySQLiteColumn>
}

export function idColumn(table: SQLiteTable) {
   return tableColumns(table).id!
}

export function withUpdatedAt(table: SQLiteTable, values: Record<string, unknown>) {
   const set = { ...values }
   if ('updatedAt' in table) set.updatedAt = nowTimestamp()
   return set
}

export function withTimestamps(table: SQLiteTable, values: Record<string, unknown>) {
   const now = nowTimestamp()
   const stamped = { ...values }
   if ('createdAt' in table) stamped.createdAt ??= now
   if ('updatedAt' in table) stamped.updatedAt ??= now
   return stamped
}

export function getRegistryEntry(event: H3Event): {
   name: string
   entry: CmsEntry
   table: SQLiteTable
} {
   const name = getRouterParam(event, 'collection')
   const config = cmsConfig as Record<string, CmsEntry>
   if (!name || !Object.hasOwn(config, name)) {
      throw createError({ statusCode: 404, statusMessage: `Unknown collection: ${name}` })
   }
   const table = resolveTable(name)
   if (!table) {
      throw createError({ statusCode: 500, statusMessage: `No table for collection: ${name}` })
   }
   return { name, entry: config[name]!, table }
}

export function buildValidator(entry: CmsEntry, path?: string) {
   const fields = path ? pageFields(entry, path) : entry.fields
   return buildEntrySchema({ ...entry, fields }, getContentI18n())
}

export function requirePageRoute(entry: CmsEntry, key: string): CmsPageRoute {
   const route = pageRouteOf(entry, key)
   if (!route) throw createError({ statusCode: 404, statusMessage: `Unknown page: ${key}` })
   return route
}

export function encodeColumnValues(entry: CmsEntry, values: Record<string, unknown>) {
   return encodeEntryTranslatableMedia(entry, values)
}

export function decodeRows<T extends Record<string, unknown>>(entry: CmsEntry, rows: T[]): T[] {
   for (const row of rows) normalizeTimestampFields(row)
   return decodeEntryTranslatableMedia(entry, rows, getContentI18n().defaultLocale)
}

export function withContentDefaults(entry: CmsEntry, values: Record<string, unknown>) {
   if (entry.kind !== 'content' || values.status !== 'published') return values
   if (!values[CONTENT_PUBLISHED_AT_FIELD]) values[CONTENT_PUBLISHED_AT_FIELD] = nowTimestamp()
   return values
}

export function parseId(event: H3Event) {
   return z.string().min(1).parse(getRouterParam(event, 'id'))
}
