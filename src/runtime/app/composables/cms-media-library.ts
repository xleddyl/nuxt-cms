import type { MediaItem, MediaSourceInfo, MediaUsage } from '../../shared/index'
import {
   expandMediaFolders,
   isWithinMediaFolder,
   mediaFolderAncestors,
   mediaFolderParent,
} from '../../shared/index'
import { computed, ref } from '#imports'
import { errorMessage } from '../utils/ui'
import { useCmsToast } from './cms-toast'

const endpoint = '/api/cms/admin/media'

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
      if (!keys.length) return {}
      try {
         const result = await $fetch<{ usage: Record<string, MediaUsage[]> }>(`${endpoint}/usage`, {
            method: 'POST',
            body: { keys },
         })
         return result.usage
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

export function usageSummary(usage: Record<string, MediaUsage[]> | null, keys: string[]) {
   if (!usage) return ''
   const entries = new Set<string>()
   let used = 0
   for (const key of keys) {
      const list = usage[key] ?? []
      if (list.length) used++
      for (const item of list) entries.add(`${item.collection}:${item.id ?? ''}`)
   }
   if (!used) return ''
   const files = keys.length === 1 ? 'It is' : `${used} of them are`
   return `${files} used in ${entries.size} entr${
      entries.size === 1 ? 'y' : 'ies'
   }, which will keep a broken link.`
}

export function usageLink(usage: MediaUsage) {
   return usage.id === null ? `/cms/${usage.collection}` : `/cms/${usage.collection}/${usage.id}`
}
