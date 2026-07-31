import { describe, expect, it } from 'vitest'
import { $cmsQuery, useCms } from '../src/runtime/app/composables/cms-query-disabled'

const QUERY = 'query Posts { posts { id title } }'

describe('disabled cms composables', () => {
   it('resolves $cmsQuery to an empty result instead of hitting the api', async () => {
      await expect($cmsQuery(QUERY)).resolves.toEqual({})
      await expect($cmsQuery(QUERY, { limit: 10 })).resolves.toEqual({})
   })

   it('returns a resolved useAsyncData shape with null data', async () => {
      const result = useCms(QUERY)
      await result

      expect(result.data.value).toBeNull()
      expect(result.error.value).toBeUndefined()
      expect(result.status.value).toBe('success')
   })

   it('exposes the useAsyncData control methods so callers never crash', async () => {
      const result = useCms(QUERY, { limit: 3 })
      await result

      expect(typeof result.refresh).toBe('function')
      expect(typeof result.execute).toBe('function')
      expect(typeof result.clear).toBe('function')

      await result.refresh()
      expect(result.data.value).toBeNull()
   })

   it('accepts the same arguments as the real composables', async () => {
      const withoutVariables = useCms(QUERY)
      const withVariables = useCms(QUERY, { locale: 'en' })
      await withoutVariables
      await withVariables

      expect(withoutVariables.data.value).toBeNull()
      expect(withVariables.data.value).toBeNull()
   })
})
