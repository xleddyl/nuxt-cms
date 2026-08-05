import { existsSync } from 'node:fs'
import { eq, inArray } from 'drizzle-orm'
import { useDb } from '#cms-db'
import { cms_media } from '#cms-tables'
import { useRuntimeConfig } from '#imports'
import type { MediaStorageMode } from '../../shared/index'
import { chunked, planMediaSync, readMediaFileMeta, scanMediaDirectory } from '../utils/media-sync'

const CHUNK_SIZE = 100

export default async () => {
   try {
      const { media } = useRuntimeConfig().cms as {
         media?: { storage?: MediaStorageMode; localRoot?: string }
      }
      if (media?.storage !== 'local') return

      const root = media.localRoot
      if (!root) return
      if (!existsSync(root)) {
         console.info(
            `[nuxt-cms] Local media folder not found: ${root}. Skipping media library sync.`
         )
         return
      }

      const files = await scanMediaDirectory(root)
      const db = useDb()
      const rows = await db.select({ key: cms_media.key, size: cms_media.size }).from(cms_media)
      const { insert, update, remove } = planMediaSync(files, rows)

      for (const chunk of chunked(insert, CHUNK_SIZE)) {
         const values = await Promise.all(chunk.map((file) => readMediaFileMeta(root, file)))
         await db
            .insert(cms_media)
            .values(values.map((value) => ({ ...value, alt: null })))
            .onConflictDoNothing()
      }

      for (const file of update) {
         const { mime, size, width, height } = await readMediaFileMeta(root, file)
         await db
            .update(cms_media)
            .set({ mime, size, width, height })
            .where(eq(cms_media.key, file.key))
      }

      for (const chunk of chunked(remove, CHUNK_SIZE)) {
         await db.delete(cms_media).where(inArray(cms_media.key, chunk))
      }

      console.info(
         `[nuxt-cms] Local media sync: ${insert.length} added, ${remove.length} removed, ${
            update.length
         } updated (${files.length} file${files.length === 1 ? '' : 's'} in ${root})`
      )
   } catch (error) {
      console.warn('[nuxt-cms] Local media sync failed:', error)
   }
}
