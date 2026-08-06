import type { SQL } from 'drizzle-orm'
import { asc, count, desc, sql } from 'drizzle-orm'
import { defineEventHandler, getValidatedQuery } from 'h3'
import { z } from 'zod'
import { useDb } from '#cms-db'
import { decodeRows, getRegistryEntry, idColumn, tableColumns } from '../utils/registry'
import { attachManyToMany, relationTitles } from '../utils/relations'
import { requireAdmin } from '../utils/require-admin'

const querySchema = z.object({
   limit: z.coerce.number().int().min(1).max(100).default(50),
   offset: z.coerce.number().int().min(0).default(0),
   search: z.string().trim().max(200).optional(),
   sort: z.string().trim().max(64).optional(),
   order: z.enum(['asc', 'desc']).default('desc'),
   light: z.stringbool().default(false),
})

function likePattern(term: string) {
   return `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
}

export default defineEventHandler(async (event) => {
   await requireAdmin(event)
   const { name, entry, table } = getRegistryEntry(event)
   const db = useDb()

   if (entry.kind === 'single') {
      const rows = (await db.select().from(table).limit(1)) as Record<string, unknown>[]
      await attachManyToMany(db, name, entry, rows)
      return decodeRows(entry, rows)[0] ?? null
   }

   const { limit, offset, search, sort, order, light } = await getValidatedQuery(
      event,
      querySchema.parse
   )

   const columns = tableColumns(table)
   const titleColumn =
      entry.titleField && Object.hasOwn(columns, entry.titleField)
         ? columns[entry.titleField]
         : undefined

   let where: SQL | undefined
   if (search) {
      const column = titleColumn ?? idColumn(table)
      where = sql`${column} like ${likePattern(search)} escape '\\'`
   }

   const selection = light
      ? Object.fromEntries([
           ['id', idColumn(table)],
           ...(entry.titleField && titleColumn ? [[entry.titleField, titleColumn]] : []),
           ...(entry.drafts && Object.hasOwn(columns, 'status')
              ? [['status', columns.status]]
              : []),
        ])
      : undefined

   const sortColumn = sort && Object.hasOwn(columns, sort) ? columns[sort] : undefined
   const orderBy = sortColumn ?? columns.createdAt ?? idColumn(table)
   const direction = sortColumn && order === 'asc' ? asc : desc
   const tiebreaker = idColumn(table)
   const base = selection ? db.select(selection).from(table) : db.select().from(table)
   const items = (await (where ? base.where(where) : base)
      .orderBy(
         ...(orderBy === tiebreaker ? [direction(orderBy)] : [direction(orderBy), desc(tiebreaker)])
      )
      .limit(limit)
      .offset(offset)) as Record<string, unknown>[]

   const [counted] = await (where
      ? db.select({ total: count() }).from(table).where(where)
      : db.select({ total: count() }).from(table))

   if (light) return { items, total: counted?.total ?? 0, relations: {} }

   await attachManyToMany(db, name, entry, items)
   decodeRows(entry, items)
   return {
      items,
      total: counted?.total ?? 0,
      relations: await relationTitles(db, entry, items),
   }
})
