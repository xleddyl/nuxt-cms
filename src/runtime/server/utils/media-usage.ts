import cmsConfig from '#cms-config'
import { useDb } from '#cms-db'
import type { CmsEntry, MediaUsage } from '../../shared/index'
import type { MediaUsageSource } from './media-references'
import { collectMediaUsage } from './media-references'
import { readPages } from './page-storage'
import { decodeRows, resolveTable } from './registry'

async function usageSources(): Promise<MediaUsageSource[]> {
   const sources: MediaUsageSource[] = []
   for (const [name, entry] of Object.entries(cmsConfig as Record<string, CmsEntry>)) {
      const table = resolveTable(name)
      if (!table) continue
      const rows =
         entry.kind === 'page'
            ? await readPages(name, entry, table)
            : decodeRows(entry, (await useDb().select().from(table)) as Record<string, unknown>[])
      sources.push({ name, entry, rows })
   }
   return sources
}

export async function loadMediaUsage(keys: string[]): Promise<Record<string, MediaUsage[]>> {
   return collectMediaUsage(await usageSources(), keys)
}
