import { inArray, like, or } from 'drizzle-orm'
import { useDb } from '#cms-db'
import { cms_media } from '#cms-tables'
import { mediaFolderMarkerKey } from '../../shared/index'
import type { MediaStore } from './media'

const KEY_CHUNK = 90

export async function writeMediaFolderMarker(store: MediaStore, folder: string) {
   const key = mediaFolderMarkerKey(folder)
   await store.write(key, new Uint8Array(), 'application/x-empty')

   const values = {
      key,
      mime: 'application/x-empty',
      size: 0,
      width: null,
      height: null,
      alt: null,
      folder,
   }

   await useDb()
      .insert(cms_media)
      .values(values)
      .onConflictDoUpdate({ target: cms_media.key, set: values })
}

export function mediaRowsInFolder(folder: string) {
   return useDb()
      .select({ key: cms_media.key, folder: cms_media.folder })
      .from(cms_media)
      .where(or(like(cms_media.folder, `${folder}/%`), like(cms_media.folder, folder)))
}

export async function deleteMediaRows(store: MediaStore, keys: string[]) {
   for (const key of keys) {
      await store.remove(key)
   }
   for (const chunk of keyChunks(keys)) {
      await useDb().delete(cms_media).where(inArray(cms_media.key, chunk))
   }
}

export function keyChunks(keys: string[]): string[][] {
   const chunks: string[][] = []
   for (let index = 0; index < keys.length; index += KEY_CHUNK) {
      chunks.push(keys.slice(index, index + KEY_CHUNK))
   }
   return chunks
}
