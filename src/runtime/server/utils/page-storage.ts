import type { SQL } from 'drizzle-orm'
import { asc, eq } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { createError } from 'h3'
import { cmsDialect, runBatch, useDb, withTransaction } from '#cms-db'
import * as cmsTables from '#cms-tables'
import type { CmsEntry, CmsPageRoute } from '../../shared/index'
import {
   PAGE_PATH_FIELD,
   isRowsStorage,
   pageFieldsTableName,
   pageMediaTableName,
} from '../../shared/index'
import type { PageDb, PageTables } from './page-rows'
import { decodePageRows, pageWriteStatements, selectPages } from './page-rows'
import { idColumn, tableColumns } from './registry'

type Row = Record<string, unknown>

export interface PageReadOptions {
   id?: string
   path?: string
   orderByPath?: boolean
}

function childTable(name: string): SQLiteTable {
   const table = (cmsTables as Record<string, unknown>)[name] as SQLiteTable | undefined
   if (!table) throw createError({ statusCode: 500, statusMessage: `No table: ${name}` })
   return table
}

function pageTables(name: string, table: SQLiteTable): PageTables {
   return {
      page: table,
      fields: childTable(pageFieldsTableName(name)),
      media: childTable(pageMediaTableName(name)),
   }
}

function pageFilter(table: SQLiteTable, options: PageReadOptions): SQL | undefined {
   if (options.id !== undefined) return eq(idColumn(table), options.id)
   if (options.path !== undefined) return eq(tableColumns(table)[PAGE_PATH_FIELD]!, options.path)
   return undefined
}

export async function readPages(
   name: string,
   entry: CmsEntry,
   table: SQLiteTable,
   options: PageReadOptions = {}
): Promise<Row[]> {
   const db = useDb()
   const where = pageFilter(table, options)
   const single = options.id !== undefined || options.path !== undefined
   const rows = isRowsStorage(entry)
      ? selectPages(db as unknown as PageDb, cmsDialect, pageTables(name, table))
      : db.select().from(table).$dynamic()
   if (where) rows.where(where)
   if (options.orderByPath) rows.orderBy(asc(tableColumns(table)[PAGE_PATH_FIELD]!))
   if (single) rows.limit(1)
   const result = (await rows) as Row[]
   return isRowsStorage(entry) ? decodePageRows(entry, result) : result
}

export async function writePage(
   name: string,
   entry: CmsEntry,
   table: SQLiteTable,
   route: Pick<CmsPageRoute, 'key' | 'path'>,
   set: Row
): Promise<Row> {
   if (!isRowsStorage(entry)) {
      return withTransaction(async (db) => {
         const [row] = await db
            .insert(table)
            .values({ id: route.key, path: route.path, ...set } as Row)
            .onConflictDoUpdate({ target: idColumn(table), set })
            .returning()
         return row as Row
      })
   }
   const tables = pageTables(name, table)
   const results = await runBatch((db) =>
      pageWriteStatements(db as unknown as PageDb, cmsDialect, tables, entry, route, set)
   )
   return decodePageRows(entry, results.at(-1) as Row[])[0]!
}
