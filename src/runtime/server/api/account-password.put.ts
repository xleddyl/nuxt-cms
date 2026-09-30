import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { useDb } from '#cms-db'
import { cms_users } from '#cms-tables'
import { replaceUserSession } from '#imports'
import { MIN_PASSWORD_LENGTH } from '../../shared/index'
import { hashPassword, verifyPassword } from '../utils/password'
import { requireAdmin } from '../utils/require-admin'
import { findUserById, sessionUserFor } from '../utils/users'

const bodySchema = z.object({
   currentPassword: z.string().max(256).optional(),
   newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(256),
})

export default defineEventHandler(async (event) => {
   const user = await requireAdmin(event)
   if (!user.id) {
      throw createError({
         statusCode: 403,
         statusMessage: 'The super admin password is set by environment variables',
      })
   }
   const body = await readValidatedBody(event, bodySchema.parse)
   const row = await findUserById(user.id)
   if (!row) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
   if (!user.firstLogin) {
      const ok =
         !!body.currentPassword && (await verifyPassword(row.passwordHash, body.currentPassword))
      if (!ok)
         throw createError({ statusCode: 400, statusMessage: 'The current password is wrong' })
   }
   const [updated] = await useDb()
      .update(cms_users)
      .set({
         passwordHash: await hashPassword(body.newPassword),
         mustChangePassword: false,
         updatedAt: new Date().toISOString(),
      })
      .where(eq(cms_users.id, user.id))
      .returning()
   await replaceUserSession(event, { user: sessionUserFor(updated!) })
   return { ok: true }
})
