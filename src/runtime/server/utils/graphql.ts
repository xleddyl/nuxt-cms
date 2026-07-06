import type { SQL } from 'drizzle-orm'
import {
   and,
   asc,
   desc,
   eq,
   gt,
   gte,
   inArray,
   isNotNull,
   isNull,
   like,
   lt,
   lte,
   ne,
   sql,
} from 'drizzle-orm'
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { GraphQLError, GraphQLScalarType, valueFromASTUntyped } from 'graphql'
import { createSchema } from 'graphql-yoga'
import cmsConfig from '#cms-config'
import { useDb } from '#cms-db'
import * as cmsTables from '#cms-tables'
import { useRuntimeConfig } from '#imports'
import type { CmsConfig, CmsEntry, FieldConfig } from '../../shared/index'
import { mediaPublicUrl, mediaTypeFor, translatableFieldKeys } from '../../shared/index'
import { blockTypeName, blockUnionName, renderGraphqlSdl, typeName } from '../../shared/graphql-sdl'
import { getContentI18n, resolveTable, tableColumns } from './registry'

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50
const LOCALE = Symbol('locale')

type Row = Record<string, unknown> & { [LOCALE]?: string }

type Filters = Record<string, Record<string, unknown> | null | undefined>

interface SortInput {
   field: string
   direction?: 'asc' | 'desc' | null
}

interface Ctx {
   loaders: Map<string, BatchLoader<unknown, unknown>>
}

class BatchLoader<K, V> {
   private queue: { key: K; resolve: (v: V | undefined) => void; reject: (e: unknown) => void }[] =
      []
   private scheduled = false

   constructor(private batchFn: (keys: K[]) => Promise<Map<K, V>>) {}

   load(key: K): Promise<V | undefined> {
      return new Promise((resolve, reject) => {
         this.queue.push({ key, resolve, reject })
         if (!this.scheduled) {
            this.scheduled = true
            queueMicrotask(() => void this.flush())
         }
      })
   }

   private async flush() {
      const batch = this.queue
      this.queue = []
      this.scheduled = false
      try {
         const map = await this.batchFn([...new Set(batch.map((b) => b.key))])
         for (const { key, resolve } of batch) resolve(map.get(key))
      } catch (error) {
         for (const { reject } of batch) reject(error)
      }
   }
}

function getLoader<K, V>(
   ctx: Ctx,
   cacheKey: string,
   batchFn: (keys: K[]) => Promise<Map<K, V>>
): BatchLoader<K, V> {
   let loader = ctx.loaders.get(cacheKey) as BatchLoader<K, V> | undefined
   if (!loader) {
      loader = new BatchLoader(batchFn)
      ctx.loaders.set(cacheKey, loader as BatchLoader<unknown, unknown>)
   }
   return loader
}

function tableFor(name: string): SQLiteTable {
   const table = resolveTable(name)
   if (!table) throw new GraphQLError(`No table for collection: ${name}`)
   return table
}

function publishedFilter(entry: CmsEntry, table: SQLiteTable): SQL[] {
   if (!entry.drafts) return []
   const status = tableColumns(table).status
   return status ? [eq(status, 'published')] : []
}

function localeOf(parent: Row): string {
   return parent[LOCALE] ?? getContentI18n().defaultLocale
}

function resolveLocaleArg(locale: unknown): string {
   const { locales, defaultLocale } = getContentI18n()
   if (locale == null || locale === '') return defaultLocale
   if (!locales.includes(String(locale))) {
      throw new GraphQLError(
         `Unknown locale: ${locale}${locales.length ? ` (available: ${locales.join(', ')})` : ''}`
      )
   }
   return String(locale)
}

function localizeRow(entry: CmsEntry, row: Record<string, unknown>, locale: string): Row {
   const { defaultLocale } = getContentI18n()
   const result: Row = { ...row, [LOCALE]: locale }
   for (const key of translatableFieldKeys(entry)) {
      const value = row[key] as Record<string, string> | null | undefined
      result[key] = value?.[locale] ?? value?.[defaultLocale] ?? null
   }
   return result
}

const OPERATORS: Record<string, (column: AnySQLiteColumn, value: unknown) => SQL> = {
   eq: (column, value) => eq(column, value),
   neq: (column, value) => ne(column, value),
   gt: (column, value) => gt(column, value),
   gte: (column, value) => gte(column, value),
   lt: (column, value) => lt(column, value),
   lte: (column, value) => lte(column, value),
   like: (column, value) => like(column, String(value).replaceAll('*', '%')),
   in: (column, value) => inArray(column, value as unknown[]),
}

function filterConditions(table: SQLiteTable, filters: Filters | null | undefined): SQL[] {
   if (!filters) return []
   const conditions: SQL[] = []
   for (const [key, ops] of Object.entries(filters)) {
      if (!ops) continue
      const column = tableColumns(table)[key]
      if (!column) throw new GraphQLError(`Unknown filter field: ${key}`)
      for (const [op, value] of Object.entries(ops)) {
         if (value === undefined) continue
         if (op === 'isNull') {
            conditions.push(value ? isNull(column) : isNotNull(column))
            continue
         }
         if (value === null) continue
         if (op === 'in' && !(value as unknown[]).length) {
            throw new GraphQLError(`Empty in list for ${key}`)
         }
         const operator = OPERATORS[op]
         if (!operator) throw new GraphQLError(`Unknown operator for ${key}: ${op}`)
         conditions.push(operator(column, value))
      }
   }
   return conditions
}

function sortOrder(table: SQLiteTable, sort: SortInput[] | null | undefined): SQL[] {
   const order: SQL[] = []
   for (const part of sort ?? []) {
      const column = tableColumns(table)[part.field]
      if (!column) throw new GraphQLError(`Unknown sort field: ${part.field}`)
      order.push(part.direction === 'desc' ? desc(column) : asc(column))
   }
   if (!order.length) {
      const fallback = tableColumns(table).createdAt ?? tableColumns(table).id
      if (fallback) order.push(desc(fallback))
   }
   return order
}

let mediaBase: string | undefined

function getMediaBase(): string {
   mediaBase ??= (useRuntimeConfig().public.cms as { mediaBaseUrl: string }).mediaBaseUrl
   return mediaBase
}

async function resolveMedia(ctx: Ctx, key: unknown) {
   if (!key) return null
   const row = await loadMedia(ctx).load(key as string)
   return row ? mediaObject(key as string, row) : null
}

function loadById(ctx: Ctx, targetName: string) {
   return getLoader<string, Record<string, unknown>>(ctx, `byId:${targetName}`, async (ids) => {
      const config = cmsConfig as CmsConfig
      const entry = config[targetName]!
      const table = tableFor(targetName)
      const id = tableColumns(table).id!
      const rows = await useDb()
         .select()
         .from(table)
         .where(and(inArray(id, ids), ...publishedFilter(entry, table)))
      return new Map(
         rows.map((row) => [
            (row as Record<string, unknown>).id as string,
            row as Record<string, unknown>,
         ])
      )
   })
}

function loadManyToMany(ctx: Ctx, name: string, key: string, field: FieldConfig) {
   return getLoader<string, Record<string, unknown>[]>(
      ctx,
      `m2m:${name}:${key}`,
      async (sourceIds) => {
         const config = cmsConfig as CmsConfig
         const targetEntry = config[field.to!]!
         const join = (cmsTables as Record<string, unknown>)[`${name}_${key}`] as SQLiteTable
         const target = tableFor(field.to!)
         const joinCols = tableColumns(join)
         const rows = await useDb()
            .select({ sourceId: joinCols.sourceId!, target })
            .from(join)
            .innerJoin(target, eq(joinCols.targetId!, tableColumns(target).id!))
            .where(
               and(inArray(joinCols.sourceId!, sourceIds), ...publishedFilter(targetEntry, target))
            )
            .orderBy(asc(joinCols.position!))
         const map = new Map<string, Record<string, unknown>[]>()
         for (const row of rows as { sourceId: string; target: Record<string, unknown> }[]) {
            if (!map.has(row.sourceId)) map.set(row.sourceId, [])
            map.get(row.sourceId)!.push(row.target)
         }
         for (const id of sourceIds) {
            if (!map.has(id)) map.set(id, [])
         }
         return map
      }
   )
}

function loadMedia(ctx: Ctx) {
   return getLoader<string, Record<string, unknown>>(ctx, 'media', async (keys) => {
      const media = (cmsTables as Record<string, unknown>).cms_media as SQLiteTable
      const keyCol = tableColumns(media).key!
      const rows = await useDb().select().from(media).where(inArray(keyCol, keys))
      return new Map(
         rows.map((row) => [
            (row as Record<string, unknown>).key as string,
            row as Record<string, unknown>,
         ])
      )
   })
}

function mediaObject(key: string, row: Record<string, unknown> | undefined) {
   return {
      key,
      url: mediaPublicUrl(getMediaBase(), key),
      alt: row?.alt ?? null,
      folder: row?.folder ?? null,
      mime: row?.mime ?? null,
      size: row?.size ?? null,
      width: row?.width ?? null,
      height: row?.height ?? null,
      type: mediaTypeFor(row?.mime as string | null, key),
   }
}

function entryResolvers(config: CmsConfig, name: string, entry: CmsEntry) {
   const resolvers: Record<string, unknown> = {}
   for (const [key, field] of Object.entries(entry.fields)) {
      if (field.type === 'relation' && field.cardinality === 'many-to-many') {
         resolvers[key] = async (parent: Row, _args: unknown, ctx: Ctx) => {
            const rows = await loadManyToMany(ctx, name, key, field).load(parent.id as string)
            return (rows ?? []).map((row) => localizeRow(config[field.to!]!, row, localeOf(parent)))
         }
      } else if (field.type === 'relation') {
         resolvers[key] = async (parent: Row, _args: unknown, ctx: Ctx) => {
            const id = parent[key]
            if (id == null) return null
            const row = await loadById(ctx, field.to!).load(id as string)
            return row ? localizeRow(config[field.to!]!, row, localeOf(parent)) : null
         }
      } else if (field.type === 'media') {
         resolvers[key] = (parent: Row, _args: unknown, ctx: Ctx) => resolveMedia(ctx, parent[key])
      }
   }
   return resolvers
}

function blockResolvers(name: string, key: string, field: FieldConfig) {
   const resolvers: Record<string, Record<string, unknown>> = {}

   resolvers[blockUnionName(name, key)] = {
      __resolveType: (value: Record<string, unknown>) =>
         blockTypeName(name, key, String(value.type)),
   }

   for (const [blockName, block] of Object.entries(field.blocks ?? {})) {
      const mediaFields = Object.entries(block.fields).filter(([, f]) => f.type === 'media')
      if (!mediaFields.length) continue
      const fieldLevel: Record<string, unknown> = {}
      for (const [blockFieldKey] of mediaFields) {
         fieldLevel[blockFieldKey] = (parent: Record<string, unknown>, _args: unknown, ctx: Ctx) =>
            resolveMedia(ctx, parent[blockFieldKey])
      }
      resolvers[blockTypeName(name, key, blockName)] = fieldLevel
   }

   return resolvers
}

interface ListArgs {
   filters?: Filters | null
   sort?: SortInput[] | null
   limit?: number | null
   offset?: number | null
   locale?: string | null
}

export function buildCmsSchema() {
   const config = cmsConfig as CmsConfig
   const entries = Object.entries(config)

   const queryResolvers: Record<string, unknown> = {}
   const typeResolvers: Record<string, Record<string, unknown>> = {}

   for (const [name, entry] of entries) {
      const gqlType = typeName(name)
      const fieldLevel = entryResolvers(config, name, entry)
      if (Object.keys(fieldLevel).length) typeResolvers[gqlType] = fieldLevel

      for (const [key, field] of Object.entries(entry.fields)) {
         if (field.type === 'blocks') Object.assign(typeResolvers, blockResolvers(name, key, field))
      }

      if (entry.kind === 'single') {
         queryResolvers[name] = async (_: unknown, args: { locale?: string }) => {
            const locale = resolveLocaleArg(args.locale)
            const table = tableFor(name)
            const published = publishedFilter(entry, table)
            const [row] = await useDb()
               .select()
               .from(table)
               .where(published.length ? and(...published) : undefined)
               .limit(1)
            return row ? localizeRow(entry, row as Record<string, unknown>, locale) : null
         }
         continue
      }

      queryResolvers[name] = async (_: unknown, args: ListArgs) => {
         const locale = resolveLocaleArg(args.locale)
         const table = tableFor(name)
         const where = [...publishedFilter(entry, table), ...filterConditions(table, args.filters)]
         const limit = Math.min(MAX_LIMIT, Math.max(0, args.limit ?? DEFAULT_LIMIT))
         const offset = Math.max(0, args.offset ?? 0)
         const rows = await useDb()
            .select()
            .from(table)
            .where(where.length ? and(...where) : undefined)
            .orderBy(...sortOrder(table, args.sort))
            .limit(limit)
            .offset(offset)
         return (rows as Record<string, unknown>[]).map((row) => localizeRow(entry, row, locale))
      }

      queryResolvers[`${name}ById`] = async (_: unknown, args: { id: string; locale?: string }) => {
         const locale = resolveLocaleArg(args.locale)
         const table = tableFor(name)
         const [row] = await useDb()
            .select()
            .from(table)
            .where(and(eq(tableColumns(table).id!, args.id), ...publishedFilter(entry, table)))
            .limit(1)
         return row ? localizeRow(entry, row as Record<string, unknown>, locale) : null
      }

      queryResolvers[`${name}Count`] = async (_: unknown, args: { filters?: Filters | null }) => {
         const table = tableFor(name)
         const where = [...publishedFilter(entry, table), ...filterConditions(table, args.filters)]
         const [counted] = await useDb()
            .select({ total: sql<number>`count(*)` })
            .from(table)
            .where(where.length ? and(...where) : undefined)
         return counted?.total ?? 0
      }
   }

   const jsonScalar = new GraphQLScalarType({
      name: 'JSON',
      serialize: (value) => value,
      parseValue: (value) => value,
      parseLiteral: (ast) => valueFromASTUntyped(ast),
   })

   return createSchema<Ctx>({
      typeDefs: renderGraphqlSdl(config),
      resolvers: {
         JSON: jsonScalar,
         Query: queryResolvers,
         ...typeResolvers,
      },
   })
}

export function createGraphqlContext(): Ctx {
   return { loaders: new Map() }
}
