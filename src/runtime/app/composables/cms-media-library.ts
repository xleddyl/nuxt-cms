import type { MediaItem, MediaSourceInfo, MediaUsage } from '../../shared/index'
import {
   expandMediaFolders,
   isWithinMediaFolder,
   mediaFolderAncestors,
   mediaFolderParent,
} from '../../shared/index'
import { computed, ref } from '#imports'
import { errorMessage } from '../utils/ui'
import { invalidateCmsMediaKeys } from './cms-media-keys'
import { useCmsToast } from './cms-toast'

const endpoint = '/api/cms/admin/media'
const USAGE_CHUNK = 1000

export interface MediaFolderStats {
   files: number
   folders: number
}

export function useCmsMediaLibrary() {
   const toast = useCmsToast()

   const items = ref<MediaItem[]>([])
   const serverFolders = ref<string[]>([])
   const source = ref<MediaSourceInfo | null>(null)
   const loading = ref(true)
   const errorCode = ref<number | null>(null)

   async function reload(options: { quiet?: boolean } = {}) {
      if (!options.quiet) loading.value = true
      errorCode.value = null
      try {
         const result = await $fetch<{
            items: MediaItem[]
            folders?: string[]
            source: MediaSourceInfo
         }>(endpoint)
         items.value = result.items
         serverFolders.value = result.folders ?? []
         source.value = result.source
      } catch (err) {
         errorCode.value = (err as { statusCode?: number }).statusCode ?? 500
      } finally {
         loading.value = false
      }
   }

   const folders = computed(() =>
      expandMediaFolders([...serverFolders.value, ...items.value.map((item) => item.folder)])
   )

   const stats = computed(() => {
      const map = new Map<string, MediaFolderStats>()
      for (const folder of folders.value) map.set(folder, { files: 0, folders: 0 })
      for (const folder of folders.value) {
         const parent = mediaFolderParent(folder)
         if (parent) map.get(parent)!.folders++
      }
      for (const item of items.value) {
         if (!item.folder) continue
         for (const folder of mediaFolderAncestors(item.folder)) {
            const entry = map.get(folder)
            if (entry) entry.files++
         }
      }
      return map
   })

   function childFolders(parent: string | null) {
      return folders.value.filter((folder) => mediaFolderParent(folder) === parent)
   }

   function itemsWithin(folder: string) {
      return items.value.filter((item) => isWithinMediaFolder(item.folder, folder))
   }

   async function attempt(title: string, action: () => Promise<unknown>) {
      try {
         await action()
         return true
      } catch (err) {
         toast.add({ title, description: errorMessage(err), color: 'error' })
         return false
      }
   }

   function createFolder(name: string) {
      return attempt('Could not create the folder', async () => {
         await $fetch(`${endpoint}/folders`, { method: 'POST', body: { name } })
         await reload({ quiet: true })
      })
   }

   function moveFolder(from: string, to: string) {
      return attempt('Could not move the folder', async () => {
         await $fetch(`${endpoint}/folders`, { method: 'PATCH', body: { from, to } })
         await reload({ quiet: true })
      })
   }

   function deleteFolder(name: string) {
      return attempt('Could not delete the folder', async () => {
         await $fetch(`${endpoint}/folders`, {
            method: 'DELETE',
            query: { name, recursive: 'true' },
         })
         invalidateCmsMediaKeys()
         await reload({ quiet: true })
      })
   }

   function moveItems(keys: string[], folder: string | null) {
      return attempt('Could not move the files', async () => {
         await $fetch(`${endpoint}/move`, { method: 'POST', body: { keys, folder } })
         await reload({ quiet: true })
      })
   }

   function deleteItems(keys: string[]) {
      return attempt('Delete failed', async () => {
         await $fetch(`${endpoint}/delete`, { method: 'POST', body: { keys } })
         invalidateCmsMediaKeys()
         await reload({ quiet: true })
      })
   }

   function updateItem(key: string, changes: { alt?: string | null; folder?: string | null }) {
      return attempt('Save failed', async () => {
         await $fetch(endpoint, { method: 'PUT', body: { key, ...changes } })
         await reload({ quiet: true })
      })
   }

   async function usage(keys: string[]): Promise<Record<string, MediaUsage[]> | null> {
      const unique = [...new Set(keys)]
      if (!unique.length) return {}
      try {
         const merged: Record<string, MediaUsage[]> = {}
         for (let index = 0; index < unique.length; index += USAGE_CHUNK) {
            const result = await $fetch<{ usage: Record<string, MediaUsage[]> }>(
               `${endpoint}/usage`,
               { method: 'POST', body: { keys: unique.slice(index, index + USAGE_CHUNK) } }
            )
            Object.assign(merged, result.usage)
         }
         return merged
      } catch {
         return null
      }
   }

   return {
      items,
      source,
      loading,
      errorCode,
      folders,
      stats,
      reload,
      childFolders,
      itemsWithin,
      createFolder,
      moveFolder,
      deleteFolder,
      moveItems,
      deleteItems,
      updateItem,
      usage,
   }
}

export type CmsMediaLibrary = ReturnType<typeof useCmsMediaLibrary>

export function usageLink(usage: Pick<MediaUsage, 'collection' | 'id'>) {
   return usage.id === null ? `/cms/${usage.collection}` : `/cms/${usage.collection}/${usage.id}`
}
