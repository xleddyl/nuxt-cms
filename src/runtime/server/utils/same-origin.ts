import type { H3Event } from 'h3'
import { createError, getRequestHeader, getRequestHost } from 'h3'

const ORIGINLESS_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function hostOfUrl(value: string | undefined) {
   if (!value) return undefined
   try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.host : undefined
   } catch {
      return undefined
   }
}

function rejectCrossOrigin(): never {
   throw createError({ statusCode: 403, statusMessage: 'Cross-origin request rejected' })
}

export function assertSameOrigin(event: H3Event) {
   const expectedHost = getRequestHost(event)
   const origin = getRequestHeader(event, 'origin')
   if (origin) {
      if (hostOfUrl(origin) !== expectedHost) rejectCrossOrigin()
      return
   }
   if (ORIGINLESS_SAFE_METHODS.has(event.method)) return
   if (hostOfUrl(getRequestHeader(event, 'referer')) !== expectedHost) rejectCrossOrigin()
}
