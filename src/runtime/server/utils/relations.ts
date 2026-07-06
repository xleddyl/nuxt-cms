import { asc, eq, inArray } from 'drizzle-orm'
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { createError } from 'h3'
import { useDb } from '#cms-db'
import * as cmsTables from '#cms-tables'
import type { CmsEntry } from '../../shared/index'
import { resolveTable, tableColumns } from './registry'

type Row = Record<string, unknown>

function manyToManyKeys(entry: CmsEntry): string[] {
   return Object.entries(entry.fields)
      .filter(([, field]) => field.type === 'relation' && field.cardinality === 'many-to-many')
      .map(([key]) => key)
}

function joinTable(name: string, key: string) {
   const table = (cmsTables as Record<string, unknown>)[`${name}_${key}`] as SQLiteTable | undefined
   if (!table) {
      throw createError({ statusCode: 500, statusMessage: `No join table for ${name}.${key}` })
   }
   const columns = table as unknown as {
      sourceId: AnySQLiteColumn
      targetId: AnySQLiteColumn
      position: AnySQLiteColumn
   }
   return {
      table,
      sourceId: columns.sourceId,
      targetId: columns.targetId,
      position: columns.position,
   }
}

export function splitRelationValues(entry: CmsEntry, body: Row) {
   const keys = manyToManyKeys(entry)
   const values = Object.fromEntries(Object.entries(body).filter(([key]) => !keys.includes(key)))
   const lists: Record<string, string[]> = {}
   for (const key of keys) {
      const ids = (body[key] as string[] | null | undefined) ?? []
      lists[key] = [...new Set(ids)]
   }
   return { values, lists }
}

export async function assertRelationTargets(entry: CmsEntry, lists: Record<string, string[]>) {
   const db = useDb()
   for (const [key, ids] of Object.entries(lists)) {
      if (!ids.length) continue
      const field = entry.fields[key]!
      const target = resolveTable(field.to!)
      if (!target) continue
      const idCol = tableColumns(target).id!
      const rows = (await db.select({ id: idCol }).from(target).where(inArray(idCol, ids))) as {
         id: string
      }[]
      if (rows.length !== ids.length) {
         const found = new Set(rows.map((row) => row.id))
         const missing = ids.filter((id) => !found.has(id))
         throw createError({
            statusCode: 422,
            statusMessage: `Unknown ${field.to} id(s) for '${key}': ${missing.join(', ')}`,
         })
      }
   }
}

export async function saveManyToMany(
   name: string,
   sourceId: string,
   lists: Record<string, string[]>
) {
   const db = useDb()
   for (const [key, ids] of Object.entries(lists)) {
      const join = joinTable(name, key)
      await db.delete(join.table).where(eq(join.sourceId, sourceId))
      if (ids.length) {
         await db
            .insert(join.table)
            .values(ids.map((targetId, position) => ({ sourceId, targetId, position })))
      }
   }
}

export async function attachManyToMany<T extends Row>(
   name: string,
   entry: CmsEntry,
   rows: T[]
): Promise<T[]> {
   const keys = manyToManyKeys(entry)
   const ids = rows.map((row) => row.id as string).filter((id) => id != null)
   if (!keys.length || !ids.length) return rows

   const db = useDb()
   for (const key of keys) {
      const join = joinTable(name, key)
      const links = (await db
         .select()
         .from(join.table)
         .where(inArray(join.sourceId, ids))
         .orderBy(asc(join.position))) as {
         sourceId: string
         targetId: string
      }[]
      const grouped = new Map<string, string[]>()
      for (const link of links) {
         const list = grouped.get(link.sourceId) ?? []
         list.push(link.targetId)
         grouped.set(link.sourceId, list)
      }
      for (const row of rows) {
         row[key as keyof T] = (grouped.get(row.id as string) ?? []) as T[keyof T]
      }
   }
   return rows
}
