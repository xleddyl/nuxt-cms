import { existsSync } from 'node:fs'
import { eq, inArray } from 'drizzle-orm'
import { useDb } from '#cms-db'
import { files as manifestFiles, generated as manifestGenerated } from '#cms-media-manifest'
import { cms_media } from '#cms-tables'
import { useRuntimeConfig } from '#imports'
import type { MediaStorageMode } from '../../shared/index'
import type { MediaFileMeta, ScannedMediaFile } from '../utils/media-sync'
import { chunked, planMediaSync, readMediaFileMeta, scanMediaDirectory } from '../utils/media-sync'

const CHUNK_SIZE = 100

interface MediaSyncSource {
   origin: string
   files: ScannedMediaFile[]
   meta: (file: ScannedMediaFile) => Promise<MediaFileMeta>
}

async function resolveMediaSource(root: string): Promise<MediaSyncSource | null> {
   if (existsSync(root)) {
      return {
         origin: root,
         files: await scanMediaDirectory(root),
         meta: (file) => readMediaFileMeta(root, file),
      }
   }
   if (!manifestGenerated) return null
   const byKey = new Map(manifestFiles.map((file) => [file.key, file]))
   return {
      origin: `build manifest of ${root}`,
      files: manifestFiles.map(({ key, size }) => ({ key, size })),
      meta: async (file) => byKey.get(file.key)!,
   }
}

export default async () => {
   try {
      const { media } = useRuntimeConfig().cms as {
         media?: { storage?: MediaStorageMode; localRoot?: string }
      }
      if (media?.storage !== 'local') return

      const root = media.localRoot
      if (!root) return

      const source = await resolveMediaSource(root)
      if (!source) {
         console.info(
            `[nuxt-cms] Local media folder not found: ${root}, and no build manifest was generated. Skipping media library sync.`
         )
         return
      }

      const db = useDb()
      const rows = await db.select({ key: cms_media.key, size: cms_media.size }).from(cms_media)
      const { insert, update, remove } = planMediaSync(source.files, rows)

      for (const chunk of chunked(insert, CHUNK_SIZE)) {
         const values = await Promise.all(chunk.map((file) => source.meta(file)))
         await db
            .insert(cms_media)
            .values(values.map((value) => ({ ...value, alt: null })))
            .onConflictDoNothing()
      }

      for (const file of update) {
         const { mime, size, width, height } = await source.meta(file)
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
         } updated (${source.files.length} file${source.files.length === 1 ? '' : 's'} in ${
            source.origin
         })`
      )
   } catch (error) {
      console.warn('[nuxt-cms] Local media sync failed:', error)
   }
}
