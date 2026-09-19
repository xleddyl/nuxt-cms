import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { useDb } from '#cms-db'
import { cms_media } from '#cms-tables'
import { useRuntimeConfig } from '#imports'
import type { FieldConfig, MediaStorageMode } from '../../shared/index'
import { useMediaIndex } from './media-index'
import type { MediaLookup } from './media-references'
import { assertKnownMedia, mediaKeysInTable, mediaReferences } from './media-references'

async function mediaLookup(): Promise<MediaLookup | null> {
   const { media } = useRuntimeConfig().cms as { media: { storage: MediaStorageMode } }
   if (media.storage !== 'local') {
      return (keys) => mediaKeysInTable(useDb() as never, cms_media as SQLiteTable, keys)
   }
   const index = await useMediaIndex()
   if (index.source.kind === 'none') return null
   return async (keys) => new Set(keys.filter((key) => index.get(key)))
}

export async function assertMediaExists(
   fields: Record<string, FieldConfig>,
   values: Record<string, unknown>
) {
   const references = mediaReferences(fields, values)
   if (!references.length) return
   const lookup = await mediaLookup()
   if (lookup) await assertKnownMedia(references, lookup)
}
