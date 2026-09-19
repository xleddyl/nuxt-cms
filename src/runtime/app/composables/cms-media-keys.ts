import { ref } from '#imports'
import type { MediaItem, MediaSourceInfo } from '../../shared/index'

const known = ref<Set<string> | null>(null)
let loading: Promise<void> | null = null

function load() {
   loading ??= $fetch<{ items: MediaItem[]; source: MediaSourceInfo }>('/api/cms/admin/media')
      .then((result) => {
         known.value =
            result.source.kind === 'none' ? null : new Set(result.items.map((item) => item.key))
      })
      .catch(() => {
         known.value = null
      })
   return loading
}

export function useCmsMediaKeys() {
   if (import.meta.client) void load()

   function isMissing(key: unknown): boolean {
      return typeof key === 'string' && key !== '' && !!known.value && !known.value.has(key)
   }

   function remember(key: string) {
      if (known.value) known.value = new Set([...known.value, key])
   }

   return { isMissing, remember }
}
