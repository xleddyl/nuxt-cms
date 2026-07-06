import type { H3Event } from 'h3'
import { createError } from 'h3'
import { getUserSession, useRuntimeConfig } from '#imports'

export async function requireAdmin(event: H3Event) {
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
