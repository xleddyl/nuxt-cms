import type { AsyncData } from 'nuxt/app'
import type {
   CmsCollectionName,
   CmsCollectionTypes,
   CmsContentName,
   CmsContentTypes,
   CmsPagePath,
   CmsPageTypes,
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

export interface CmsPageOptions<ResT, DefaultT> extends CmsAsyncDataOptions<ResT, DefaultT> {
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

export interface CmsContentOptions<ResT, DefaultT> extends CmsAsyncDataOptions<ResT, DefaultT> {
   locale?: string
}

export type CmsContentsOptions<ResT, DefaultT, Entry> = CmsCollectionOptions<ResT, DefaultT, Entry>

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

export function useCmsContents<K extends CmsContentName, DefaultT = CmsContentTypes[K][]>(
   name: K,
   options: CmsContentsOptions<CmsContentTypes[K][], DefaultT, CmsContentTypes[K]> = {}
): AsyncData<CmsContentTypes[K][] | DefaultT, Error | undefined> {
   const { locale, filters, sort, limit, offset, key, default: fallback } = options
   const variables = { locale, filters, sort, limit, offset }
   return useAsyncData(
      key ?? `cms-contents:${String(name)}:${JSON.stringify(variables)}`,
      async () => (fallback ? fallback() : [])
   ) as unknown as AsyncData<CmsContentTypes[K][] | DefaultT, Error | undefined>
}

export function useCmsContent<K extends CmsContentName, DefaultT = null>(
   name: K,
   slug: string,
   options: CmsContentOptions<CmsContentTypes[K] | null, DefaultT> = {}
): AsyncData<CmsContentTypes[K] | DefaultT | null, Error | undefined> {
   const { locale, key, default: fallback } = options
   return useAsyncData(key ?? `cms-content:${String(name)}:${slug}:${locale ?? ''}`, async () =>
      fallback ? fallback() : null
   ) as unknown as AsyncData<CmsContentTypes[K] | DefaultT | null, Error | undefined>
}

export function useCmsPage<P extends CmsPagePath, DefaultT = null>(
   path: P,
   options: CmsPageOptions<CmsPageTypes[P] | null, DefaultT> = {}
): AsyncData<CmsPageTypes[P] | DefaultT | null, Error | undefined> {
   const { locale, key, default: fallback } = options
   return useAsyncData(key ?? `cms-page:${String(path)}:${locale ?? ''}`, async () =>
      fallback ? fallback() : null
   ) as unknown as AsyncData<CmsPageTypes[P] | DefaultT | null, Error | undefined>
}
