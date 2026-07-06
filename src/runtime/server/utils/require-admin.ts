import type { H3Event } from 'h3'
import { createError, getRequestHeader, getRequestHost } from 'h3'
import { getUserSession, useRuntimeConfig } from '#imports'

function assertSameOrigin(event: H3Event) {
   const origin = getRequestHeader(event, 'origin')
   if (!origin) return
   let originHost: string | undefined
   try {
      originHost = new URL(origin).host
   } catch {
      originHost = undefined
   }
   if (!originHost || originHost !== getRequestHost(event, { xForwardedHost: true })) {
      throw createError({ statusCode: 403, statusMessage: 'Cross-origin request rejected' })
   }
}

export async function requireAdmin(event: H3Event) {
   assertSameOrigin(event)
   const session = await getUserSession(event)
   const email = session.user?.email
   if (!email) {
      throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
   }
   const { adminEmail } = useRuntimeConfig(event).cms as { adminEmail: string }
   if (!adminEmail || email.toLowerCase() !== adminEmail.toLowerCase()) {
      throw createError({ statusCode: 403, statusMessage: 'Not authorized' })
   }
}
