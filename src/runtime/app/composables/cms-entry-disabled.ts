import type { AsyncData } from 'nuxt/app'
import type {
   CmsCollectionName,
   CmsCollectionTypes,
   CmsSingleName,
   CmsSingleTypes,
} from '#cms-types'
import { useAsyncData } from '#imports'
import type { CmsAsyncDataOptions } from './cms-query-disabled'

export interface CmsSortInput<Entry> {
   field: Extract<keyof Entry, string>
   direction?: 'asc' | 'desc'
}

export interface CmsSingleOptions<ResT, DefaultT> extends CmsAsyncDataOptions<ResT, DefaultT> {
   locale?: string
}

export interface CmsCollectionOptions<ResT, DefaultT, Entry>
   extends CmsAsyncDataOptions<ResT, DefaultT> {
   locale?: string
   filters?: Record<string, unknown>
   sort?: CmsSortInput<Entry>[]
   limit?: number
   offset?: number
}

export function useCmsSingle<K extends CmsSingleName, DefaultT = null>(
   name: K,
   options: CmsSingleOptions<CmsSingleTypes[K] | null, DefaultT> = {}
): AsyncData<CmsSingleTypes[K] | DefaultT | null, Error | undefined> {
   const { locale, key, default: fallback } = options
   return useAsyncData(key ?? `cms-single:${String(name)}:${locale ?? ''}`, async () =>
      fallback ? fallback() : null
   ) as unknown as AsyncData<CmsSingleTypes[K] | DefaultT | null, Error | undefined>
}

export function useCmsCollection<K extends CmsCollectionName, DefaultT = CmsCollectionTypes[K][]>(
   name: K,
   options: CmsCollectionOptions<CmsCollectionTypes[K][], DefaultT, CmsCollectionTypes[K]> = {}
): AsyncData<CmsCollectionTypes[K][] | DefaultT, Error | undefined> {
   const { locale, filters, sort, limit, offset, key, default: fallback } = options
   const variables = { locale, filters, sort, limit, offset }
   return useAsyncData(
      key ?? `cms-collection:${String(name)}:${JSON.stringify(variables)}`,
      async () => (fallback ? fallback() : [])
   ) as unknown as AsyncData<CmsCollectionTypes[K][] | DefaultT, Error | undefined>
}
