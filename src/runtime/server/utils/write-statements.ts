import { eq, getTableColumns, inArray } from 'drizzle-orm'
import type { AnySQLiteColumn, BaseSQLiteDatabase, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { isMediaFolderMarker, mediaFolderDepth, mediaFolderMarkerKey } from '../../shared/index'
import { nowTimestamp } from '../../shared/timestamps'

export type WriteDb = Pick<
   BaseSQLiteDatabase<'sync' | 'async', unknown>,
   'insert' | 'update' | 'delete'
>

export interface JoinTable {
   table: SQLiteTable
   sourceId: AnySQLiteColumn
   targetId: AnySQLiteColumn
   position: AnySQLiteColumn
}

export interface RebasedMediaRow {
   key: string
   folder: string | null
   target: string | null
}

export interface MediaFolderRename {
   folders: [string, string | null][]
   markers: string[]
   staleMarkers: string[]
}

export const KEY_CHUNK = 90
const JOIN_INSERT_CHUNK = 30

export function chunks<T>(items: T[], size: number): T[][] {
   const out: T[][] = []
   for (let index = 0; index < items.length; index += size) {
      out.push(items.slice(index, index + size))
   }
   return out
}

export function joinWriteStatements(
   db: WriteDb,
   join: JoinTable,
   sourceId: string,
   ids: string[]
): PromiseLike<unknown>[] {
   const statements: PromiseLike<unknown>[] = [
      db.delete(join.table).where(eq(join.sourceId, sourceId)),
   ]
   const rows = ids.map((targetId, position) => ({ sourceId, targetId, position }))
   for (const chunk of chunks(rows, JOIN_INSERT_CHUNK)) {
      statements.push(db.insert(join.table).values(chunk))
   }
   return statements
}

export function mediaFolderMarkerValues(folder: string) {
   return {
      key: mediaFolderMarkerKey(folder),
      mime: 'application/x-empty',
      size: 0,
      width: null,
      height: null,
      alt: null,
      folder,
   }
}

export function planMediaFolderRename(rows: RebasedMediaRow[]): MediaFolderRename {
   const folders = new Map<string, string | null>()
   const markers = new Set<string>()
   for (const row of rows) {
      if (!isMediaFolderMarker(row.key)) {
         if (row.folder) folders.set(row.folder, row.target)
      } else if (row.target) {
         markers.add(row.target)
      }
   }
   const markerKeys = new Set([...markers].map(mediaFolderMarkerKey))
   return {
      folders: [...folders].sort(([a], [b]) => mediaFolderDepth(a) - mediaFolderDepth(b)),
      markers: [...markers],
      staleMarkers: rows
         .filter((row) => isMediaFolderMarker(row.key) && !markerKeys.has(row.key))
         .map((row) => row.key),
   }
}

function mediaColumns(table: SQLiteTable) {
   const columns = getTableColumns(table) as Record<string, AnySQLiteColumn>
   return { key: columns.key!, folder: columns.folder! }
}

export function mediaFolderRenameStatements(
   db: WriteDb,
   table: SQLiteTable,
   plan: MediaFolderRename
): PromiseLike<unknown>[] {
   const columns = mediaColumns(table)
   const statements: PromiseLike<unknown>[] = []
   for (const [folder, target] of plan.folders) {
      statements.push(db.update(table).set({ folder: target }).where(eq(columns.folder, folder)))
   }
   for (const folder of plan.markers) {
      const values = mediaFolderMarkerValues(folder)
      statements.push(
         db
            .insert(table)
            .values({ ...values, createdAt: nowTimestamp() })
            .onConflictDoUpdate({ target: columns.key, set: values })
      )
   }
   for (const keys of chunks(plan.staleMarkers, KEY_CHUNK)) {
      statements.push(db.delete(table).where(inArray(columns.key, keys)))
   }
   return statements
}

export function mediaDeleteStatements(
   db: WriteDb,
   table: SQLiteTable,
   keys: string[]
): PromiseLike<unknown>[] {
   const { key } = mediaColumns(table)
   return chunks(keys, KEY_CHUNK).map((chunk) => db.delete(table).where(inArray(key, chunk)))
}
