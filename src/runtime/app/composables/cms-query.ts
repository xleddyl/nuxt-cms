import type { CmsResult, CmsVariables } from '#cms-graphql'
import type { AsyncData } from 'nuxt/app'
import { useAsyncData } from '#imports'

interface GraphqlResponse<T> {
   data?: T
   errors?: { message: string }[]
}

const ENDPOINT = '/api/cms/graphql'

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

export function useCms<const Q extends string>(
   query: Q,
   variables?: CmsVariables<Q>
): AsyncData<CmsResult<Q> | undefined, Error | undefined> {
   return useAsyncData<CmsResult<Q>>(`cms-gql:${query}:${JSON.stringify(variables ?? {})}`, () =>
      $cmsQuery(query, variables)
   ) as AsyncData<CmsResult<Q> | undefined, Error | undefined>
}
