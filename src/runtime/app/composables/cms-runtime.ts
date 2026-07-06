import { useRuntimeConfig } from '#imports'
import type { CmsI18n } from '../../shared/index'

export function useCmsRuntime() {
   return useRuntimeConfig().public.cms as unknown as { mediaBaseUrl: string; i18n: CmsI18n }
}
