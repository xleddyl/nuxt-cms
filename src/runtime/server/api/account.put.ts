import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { useDb } from '#cms-db'
import { cms_users } from '#cms-tables'
import { replaceUserSession } from '#imports'
import type { CmsAccount } from '../../shared/index'
import { requireAdmin } from '../utils/require-admin'
import { sessionUserFor, toAccount } from '../utils/users'

const bodySchema = z.object({
   name: z.string().trim().max(120).nullable(),
})

export default defineEventHandler(async (event): Promise<CmsAccount> => {
   const user = await requireAdmin(event)
   if (!user.id) {
      throw createError({
         statusCode: 403,
         statusMessage: 'The super admin account is set by environment variables',
      })
   }
   const body = await readValidatedBody(event, bodySchema.parse)
   const name = body.name || null
   const [row] = await useDb()
      .update(cms_users)
      .set({ name, updatedAt: new Date().toISOString() })
      .where(eq(cms_users.id, user.id))
      .returning()
   await replaceUserSession(event, { user: sessionUserFor(row!) })
   return toAccount(row!)
})
