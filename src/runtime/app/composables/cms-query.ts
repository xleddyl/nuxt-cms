import type { CmsResult, CmsVariables } from '#cms-graphql'
import type { AsyncData, AsyncDataOptions } from 'nuxt/app'
import { useAsyncData } from '#imports'
import { CMS_GRAPHQL_BATCH_LIMIT } from '../../shared/index'

interface GraphqlResponse<T> {
   data?: T
   errors?: { message: string }[]
}

export interface CmsAsyncDataOptions<ResT, DefaultT>
   extends Pick<
      AsyncDataOptions<ResT>,
      'server' | 'lazy' | 'immediate' | 'deep' | 'dedupe' | 'watch' | 'getCachedData'
   > {
   key?: string
   default?: () => DefaultT
}

interface GraphqlRequest {
   query: string
   variables?: unknown
}

interface PendingRequest {
   body: GraphqlRequest
   resolve: (response: GraphqlResponse<unknown>) => void
   reject: (error: unknown) => void
}

const ENDPOINT = '/api/cms/graphql'

const inFlight = new Map<string, Promise<GraphqlResponse<unknown>>>()
let queue: PendingRequest[] = []
let scheduled = false

function responseError(response: GraphqlResponse<unknown> | undefined) {
   return new Error(
      response?.errors?.map((e) => e.message).join('; ') || 'Invalid batched GraphQL response'
   )
}

async function sendBatch(batch: PendingRequest[]) {
   try {
      if (batch.length === 1) {
         batch[0]!.resolve(
            await $fetch<GraphqlResponse<unknown>>(ENDPOINT, {
               method: 'POST',
               body: batch[0]!.body,
            })
         )
         return
      }
      const responses = await $fetch<GraphqlResponse<unknown>[] | GraphqlResponse<unknown>>(
         ENDPOINT,
         { method: 'POST', body: batch.map((pending) => pending.body) }
      )
      if (!Array.isArray(responses)) throw responseError(responses)
      batch.forEach((pending, index) => {
         const response = responses[index]
         if (response) pending.resolve(response)
         else pending.reject(responseError(response))
      })
   } catch (error) {
      for (const pending of batch) pending.reject(error)
   }
}

function flushQueue() {
   const pending = queue
   queue = []
   scheduled = false
   for (let index = 0; index < pending.length; index += CMS_GRAPHQL_BATCH_LIMIT) {
      void sendBatch(pending.slice(index, index + CMS_GRAPHQL_BATCH_LIMIT))
   }
}

function requestGraphql(body: GraphqlRequest): Promise<GraphqlResponse<unknown>> {
   const key = JSON.stringify(body)
   const existing = inFlight.get(key)
   if (existing) return existing
   const request = new Promise<GraphqlResponse<unknown>>((resolve, reject) => {
      queue.push({ body, resolve, reject })
      if (!scheduled) {
         scheduled = true
         setTimeout(flushQueue, 0)
      }
   }).finally(() => inFlight.delete(key))
   inFlight.set(key, request)
   return request
}

export function cmsQueryKey(query: string, variables?: unknown) {
   return `cms-gql:${query}:${JSON.stringify(variables ?? {})}`
}

export async function $cmsQuery<const Q extends string>(
   query: Q,
   variables?: CmsVariables<Q>
): Promise<CmsResult<Q>> {
   const res = (await requestGraphql({ query, variables })) as GraphqlResponse<CmsResult<Q>>
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
