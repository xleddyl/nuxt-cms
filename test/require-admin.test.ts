import type { H3Event } from 'h3'
import { createEvent } from 'h3'
import { describe, expect, it } from 'vitest'
import { assertSameOrigin } from '../src/runtime/server/utils/require-admin'

const HOST = 'cms.example.com'

function event(method: string, headers: Record<string, string> = {}) {
   const req = { method, headers: { host: HOST, ...headers }, url: '/api/cms/admin/events' }
   const res = { setHeader() {}, getHeader() {}, end() {} }
   return createEvent(req as never, res as never) as H3Event
}

function statusOf(run: () => void) {
   try {
      run()
   } catch (error) {
      return (error as { statusCode?: number }).statusCode
   }
   return 200
}

describe('assertSameOrigin', () => {
   it('accepts a same-origin request on any method', () => {
      for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
         expect(
            statusOf(() => assertSameOrigin(event(method, { origin: `https://${HOST}` })))
         ).toBe(200)
      }
   })

   it('rejects a cross-origin request on any method', () => {
      for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
         expect(
            statusOf(() => assertSameOrigin(event(method, { origin: 'https://evil.example' })))
         ).toBe(403)
      }
   })

   it('rejects an unparseable or opaque origin', () => {
      for (const origin of ['null', 'not a url', 'javascript:alert(1)', `file://${HOST}`]) {
         expect(statusOf(() => assertSameOrigin(event('POST', { origin })))).toBe(403)
      }
   })

   it('allows a missing origin only on safe methods', () => {
      for (const method of ['GET', 'HEAD', 'OPTIONS']) {
         expect(statusOf(() => assertSameOrigin(event(method)))).toBe(200)
      }
   })

   it('rejects a missing origin on unsafe methods', () => {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
         expect(statusOf(() => assertSameOrigin(event(method)))).toBe(403)
      }
   })

   it('falls back to the referer host when the origin is missing', () => {
      expect(
         statusOf(() =>
            assertSameOrigin(event('POST', { referer: `https://${HOST}/cms/events/new` }))
         )
      ).toBe(200)
      expect(
         statusOf(() =>
            assertSameOrigin(event('POST', { referer: 'https://evil.example/cms/events/new' }))
         )
      ).toBe(403)
   })

   it('ignores x-forwarded-host when deciding the expected origin', () => {
      expect(
         statusOf(() =>
            assertSameOrigin(
               event('POST', {
                  origin: 'https://evil.example',
                  'x-forwarded-host': 'evil.example',
               })
            )
         )
      ).toBe(403)
      expect(
         statusOf(() =>
            assertSameOrigin(
               event('POST', {
                  origin: `https://${HOST}`,
                  'x-forwarded-host': 'evil.example',
               })
            )
         )
      ).toBe(200)
   })
})
