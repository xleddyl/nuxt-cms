import type { AsyncData } from 'nuxt/app'
import type {
   CmsCollectionName,
   CmsCollectionTypes,
   CmsSingleName,
   CmsSingleTypes,
} from '#cms-types'
import { cmsCollectionQueries, cmsSingleQueries } from '#cms-queries'
import { useAsyncData } from '#imports'
import type { CmsAsyncDataOptions } from './cms-query'
import { $cmsQuery } from './cms-query'

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

function unknownEntry(name: string): never {
   throw new Error(`[nuxt-cms] no generated query for "${name}"; check cms.config.ts`)
}

export function useCmsSingle<K extends CmsSingleName, DefaultT = null>(
   name: K,
   options: CmsSingleOptions<CmsSingleTypes[K] | null, DefaultT> = {}
): AsyncData<CmsSingleTypes[K] | DefaultT | null, Error | undefined> {
   const { locale, key, default: fallback, ...asyncDataOptions } = options
   const entryName = String(name)
   const query = cmsSingleQueries[entryName]

   return useAsyncData(
      key ?? `cms-single:${entryName}:${locale ?? ''}`,
      async () => {
         if (!query) unknownEntry(entryName)
         const result = await $cmsQuery(query, { locale })
         return (result?.[entryName] ?? null) as CmsSingleTypes[K] | null
      },
      {
         default: (fallback ?? (() => null)) as () => CmsSingleTypes[K] | null,
         ...asyncDataOptions,
      }
   ) as AsyncData<CmsSingleTypes[K] | DefaultT | null, Error | undefined>
}

export function useCmsCollection<K extends CmsCollectionName, DefaultT = CmsCollectionTypes[K][]>(
   name: K,
   options: CmsCollectionOptions<CmsCollectionTypes[K][], DefaultT, CmsCollectionTypes[K]> = {}
): AsyncData<CmsCollectionTypes[K][] | DefaultT, Error | undefined> {
   const {
      locale,
      filters,
      sort,
      limit,
      offset,
      key,
      default: fallback,
      ...asyncDataOptions
   } = options
   const entryName = String(name)
   const query = cmsCollectionQueries[entryName]
   const variables = { locale, filters, sort, limit, offset }

   return useAsyncData(
      key ?? `cms-collection:${entryName}:${JSON.stringify(variables)}`,
      async () => {
         if (!query) unknownEntry(entryName)
         const result = await $cmsQuery(query, variables)
         return (result?.[entryName] ?? []) as CmsCollectionTypes[K][]
      },
      {
         default: (fallback ?? (() => [])) as () => CmsCollectionTypes[K][],
         ...asyncDataOptions,
      }
   ) as AsyncData<CmsCollectionTypes[K][] | DefaultT, Error | undefined>
}
