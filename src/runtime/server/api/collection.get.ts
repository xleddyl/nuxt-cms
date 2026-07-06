import type { SQL } from 'drizzle-orm'
import { count, desc, sql } from 'drizzle-orm'
import { defineEventHandler, getValidatedQuery } from 'h3'
import { z } from 'zod'
import { useDb } from '#cms-db'
import { getRegistryEntry, idColumn, tableColumns } from '../utils/registry'
import { attachManyToMany } from '../utils/relations'
import { requireAdmin } from '../utils/require-admin'

const querySchema = z.object({
   limit: z.coerce.number().int().min(1).max(100).default(50),
   offset: z.coerce.number().int().min(0).default(0),
   search: z.string().trim().max(200).optional(),
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
      const rows = await db.select().from(table).limit(1)
      await attachManyToMany(db, name, entry, rows)
      return rows[0] ?? null
   }

   const { limit, offset, search, light } = await getValidatedQuery(event, querySchema.parse)

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

   const orderBy = columns.createdAt ?? idColumn(table)
   const base = selection ? db.select(selection).from(table) : db.select().from(table)
   const items = (await (where ? base.where(where) : base)
      .orderBy(desc(orderBy))
      .limit(limit)
      .offset(offset)) as Record<string, unknown>[]

   const [counted] = await (where
      ? db.select({ total: count() }).from(table).where(where)
      : db.select({ total: count() }).from(table))

   if (!light) await attachManyToMany(db, name, entry, items)
   return { items, total: counted?.total ?? 0 }
})
