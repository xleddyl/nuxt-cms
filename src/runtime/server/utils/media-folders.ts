import { eq, or, sql } from 'drizzle-orm'
import { runBatch, useDb } from '#cms-db'
import { cms_media } from '#cms-tables'
import { mediaFolderMarkerKey } from '../../shared/index'
import { nowTimestamp } from '../../shared/timestamps'
import type { MediaStore } from './media'
import type { WriteDb } from './write-statements'
import {
   chunks,
   KEY_CHUNK,
   mediaDeleteStatements,
   mediaFolderMarkerValues,
} from './write-statements'

function escapeLike(value: string) {
   return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
}

export async function writeMediaFolderMarker(store: MediaStore, folder: string) {
   await store.write(mediaFolderMarkerKey(folder), new Uint8Array(), 'application/x-empty')

   const values = mediaFolderMarkerValues(folder)

   await useDb()
      .insert(cms_media)
      .values({ ...values, createdAt: nowTimestamp() })
      .onConflictDoUpdate({ target: cms_media.key, set: values })
}

export function mediaRowsInFolder(folder: string) {
   return useDb()
      .select({ key: cms_media.key, folder: cms_media.folder })
      .from(cms_media)
      .where(
         or(
            sql`${cms_media.folder} like ${`${escapeLike(folder)}/%`} escape '\\'`,
            eq(cms_media.folder, folder)
         )
      )
}

export async function deleteMediaRows(store: MediaStore, keys: string[]) {
   await runBatch((db) => mediaDeleteStatements(db as unknown as WriteDb, cms_media, keys))
   for (const key of keys) {
      await store.remove(key)
   }
}

export function keyChunks(keys: string[]): string[][] {
   return chunks(keys, KEY_CHUNK)
}
