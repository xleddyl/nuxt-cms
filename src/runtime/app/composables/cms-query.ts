import type { CmsResult, CmsVariables } from '#cms-graphql'
import type { AsyncData, AsyncDataOptions } from 'nuxt/app'
import { useAsyncData } from '#imports'

interface GraphqlResponse<T> {
   data?: T
   errors?: { message: string }[]
}

export interface CmsAsyncDataOptions<ResT, DefaultT>
   extends Pick<
      AsyncDataOptions<ResT>,
      'server' | 'lazy' | 'immediate' | 'deep' | 'dedupe' | 'watch'
   > {
   key?: string
   default?: () => DefaultT
}

const ENDPOINT = '/api/cms/graphql'

export function cmsQueryKey(query: string, variables?: unknown) {
   return `cms-gql:${query}:${JSON.stringify(variables ?? {})}`
}

export async function $cmsQuery<const Q extends string>(
   query: Q,
   variables?: CmsVariables<Q>
): Promise<CmsResult<Q>> {
   const res = await $fetch<GraphqlResponse<CmsResult<Q>>>(ENDPOINT, {
      method: 'POST',
      body: { query, variables },
   })
   if (res.errors?.length) {
      throw new Error(res.errors.map((e) => e.message).join('; '))
   }
   return res.data as CmsResult<Q>
}

export function useCms<const Q extends string, DefaultT = undefined>(
   query: Q,
   variables?: CmsVariables<Q>,
   options: CmsAsyncDataOptions<CmsResult<Q>, DefaultT> = {}
): AsyncData<CmsResult<Q> | DefaultT | undefined, Error | undefined> {
   const { key, ...asyncDataOptions } = options
   return useAsyncData<CmsResult<Q>>(
      key ?? cmsQueryKey(query, variables),
      () => $cmsQuery(query, variables),
      asyncDataOptions as AsyncDataOptions<CmsResult<Q>>
   ) as AsyncData<CmsResult<Q> | DefaultT | undefined, Error | undefined>
}
