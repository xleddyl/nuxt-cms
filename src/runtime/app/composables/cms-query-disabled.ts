import type { AsyncData } from 'nuxt/app'
import { useAsyncData } from '#imports'

type CmsDisabledResult = Record<string, any>
type CmsDisabledVariables = Record<string, any>

export async function $cmsQuery<const Q extends string>(
   query: Q,
   variables?: CmsDisabledVariables
): Promise<CmsDisabledResult> {
   return {}
}

export function useCms<const Q extends string>(
   query: Q,
   variables?: CmsDisabledVariables
): AsyncData<CmsDisabledResult | undefined, Error | undefined> {
   return useAsyncData<CmsDisabledResult | null>(
      `cms-gql:${query}:${JSON.stringify(variables ?? {})}`,
      async () => null
   ) as unknown as AsyncData<CmsDisabledResult | undefined, Error | undefined>
}
