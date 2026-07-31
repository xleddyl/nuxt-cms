import { useRuntimeConfig } from '#imports'
import type { CmsI18n, MediaStorageMode } from '../../shared/index'

export function useCmsRuntime() {
   return useRuntimeConfig().public.cms as unknown as {
      mediaBaseUrl: string
      mediaStorage: MediaStorageMode
      i18n: CmsI18n
   }
}
