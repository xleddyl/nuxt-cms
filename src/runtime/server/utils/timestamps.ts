import { is } from 'drizzle-orm'
import { SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core'
import { SQLITE_ISO_FORMAT } from '../../shared/timestamps'

export interface TimestampColumn {
   table: string
   column: string
}

export interface TimestampBackfillDriver {
   select: (query: string) => Promise<unknown[]>
   write: (statements: string[]) => Promise<unknown>
}

const TIMESTAMP_COLUMNS = new Set(['created_at', 'updated_at'])

function quoteIdentifier(name: string) {
   return `"${name.replaceAll('"', '""')}"`
}

function legacyCondition(column: string) {
   const target = quoteIdentifier(column)
   return `${target} NOT LIKE '%T%' AND strftime('${SQLITE_ISO_FORMAT}', ${target}) IS NOT NULL`
}

export function timestampColumns(tables: Record<string, unknown>): TimestampColumn[] {
   const found: TimestampColumn[] = []
   for (const table of Object.values(tables)) {
      if (!is(table, SQLiteTable)) continue
      const { name, columns } = getTableConfig(table)
      for (const column of columns) {
         if (TIMESTAMP_COLUMNS.has(column.name)) found.push({ table: name, column: column.name })
      }
   }
   return found
}

export function timestampProbeQuery(columns: TimestampColumn[]): string {
   return columns
      .map(
         ({ table, column }, index) =>
            `SELECT ${index} AS target WHERE EXISTS (SELECT 1 FROM ${quoteIdentifier(
               table
            )} WHERE ${legacyCondition(column)})`
      )
      .join(' UNION ALL ')
}

export function timestampBackfillStatement({ table, column }: TimestampColumn): string {
   const target = quoteIdentifier(column)
   return `UPDATE ${quoteIdentifier(
      table
   )} SET ${target} = strftime('${SQLITE_ISO_FORMAT}', ${target}) WHERE ${legacyCondition(column)}`
}

function targetIndex(row: unknown): number {
   if (Array.isArray(row)) return Number(row[0])
   return Number((row as { target: unknown }).target)
}

export async function backfillTimestamps(
   tables: Record<string, unknown>,
   driver: TimestampBackfillDriver
): Promise<number> {
   const columns = timestampColumns(tables)
   if (!columns.length) return 0
   const rows = await driver.select(timestampProbeQuery(columns))
   const stale = rows
      .map((row) => columns[targetIndex(row)])
      .filter((column): column is TimestampColumn => !!column)
   if (!stale.length) return 0
   await driver.write(stale.map(timestampBackfillStatement))
   return stale.length
}
