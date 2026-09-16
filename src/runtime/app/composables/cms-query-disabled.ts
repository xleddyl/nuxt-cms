import type { AsyncData, AsyncDataOptions } from 'nuxt/app'
import { useAsyncData } from '#imports'

type CmsDisabledResult = Record<string, any>
type CmsDisabledVariables = Record<string, any>

export interface CmsAsyncDataOptions<ResT, DefaultT>
   extends Pick<
      AsyncDataOptions<ResT>,
      'server' | 'lazy' | 'immediate' | 'deep' | 'dedupe' | 'watch'
   > {
   key?: string
   default?: () => DefaultT
}

export function cmsQueryKey(query: string, variables?: unknown) {
   return `cms-gql:${query}:${JSON.stringify(variables ?? {})}`
}

export async function $cmsQuery<const Q extends string>(
   query: Q,
   variables?: CmsDisabledVariables
): Promise<CmsDisabledResult> {
   return {}
}

export function useCms<const Q extends string, DefaultT = undefined>(
   query: Q,
   variables?: CmsDisabledVariables,
   options: CmsAsyncDataOptions<CmsDisabledResult, DefaultT> = {}
): AsyncData<CmsDisabledResult | DefaultT | undefined, Error | undefined> {
   const { key, default: defaultValue } = options
   return useAsyncData<CmsDisabledResult | null>(key ?? cmsQueryKey(query, variables), async () =>
      defaultValue ? (defaultValue() as CmsDisabledResult | null) : null
   ) as unknown as AsyncData<CmsDisabledResult | DefaultT | undefined, Error | undefined>
}
