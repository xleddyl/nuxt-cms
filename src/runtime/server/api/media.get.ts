import { desc } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { useDb } from '#cms-db'
import { cms_media } from '#cms-tables'
import type { MediaItem } from '../../shared/index'
import { toMediaItem, useMediaConfig } from '../utils/media'
import { requireAdmin } from '../utils/require-admin'

export default defineEventHandler(async (event) => {
   await requireAdmin(event)
   const { publicUrl } = useMediaConfig(event)

   const rows = await useDb()
      .select()
      .from(cms_media)
      .orderBy(desc(cms_media.createdAt), desc(cms_media.id))

   const items: MediaItem[] = rows.map((row) => toMediaItem(row, publicUrl))

   return { items }
})
