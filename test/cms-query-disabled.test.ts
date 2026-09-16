import { describe, expect, it } from 'vitest'
import { $cmsQuery, cmsQueryKey, useCms } from '../src/runtime/app/composables/cms-query-disabled'

const QUERY = 'query Posts { posts { id title } }'

const keyOf = (result: unknown) => (result as { key: string }).key

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

   it('uses the key given in the options', async () => {
      const result = useCms(QUERY, { locale: 'en' }, { key: 'cms-page:/home:en' })
      await result

      expect(keyOf(result)).toBe('cms-page:/home:en')
   })

   it('falls back to the query key when the options give none', async () => {
      const result = useCms(QUERY, { locale: 'en' })
      await result

      expect(keyOf(result)).toBe(cmsQueryKey(QUERY, { locale: 'en' }))
   })

   it('returns the default value when the options give one', async () => {
      const result = useCms(QUERY, undefined, { default: () => ({ posts: [] }) })
      await result

      expect(result.data.value).toEqual({ posts: [] })
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
