import { desc } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { useDb } from '#cms-db'
import { cms_media } from '#cms-tables'
import type { MediaItem, MediaSourceInfo } from '../../shared/index'
import { useMediaIndex } from '../utils/media-index'
import { toMediaItem, useMediaConfig } from '../utils/media'
import { requireAdmin } from '../utils/require-admin'

export default defineEventHandler(async (event) => {
   await requireAdmin(event)
   const { media, publicUrl } = useMediaConfig(event)

   if (media.storage === 'local') {
      const index = await useMediaIndex()
      const rows = await useDb().select({ key: cms_media.key, alt: cms_media.alt }).from(cms_media)
      const altByKey = new Map(rows.map((row) => [row.key, row.alt]))

      const items: MediaItem[] = index.files.map((file) =>
         toMediaItem({ ...file, alt: altByKey.get(file.key) ?? null, createdAt: null }, publicUrl)
      )

      return { items, source: index.source }
   }

   const rows = await useDb()
      .select()
      .from(cms_media)
      .orderBy(desc(cms_media.createdAt), desc(cms_media.id))

   const items: MediaItem[] = rows.map((row) => toMediaItem(row, publicUrl))
   const source: MediaSourceInfo = { kind: 'database', root: '', builtAt: null }

   return { items, source }
})
