import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam, readValidatedBody } from 'h3'
import { z } from 'zod'
import { useDb } from '#cms-db'
import { cms_users } from '#cms-tables'
import type { CmsAccount } from '../../shared/index'
import { MIN_PASSWORD_LENGTH } from '../../shared/index'
import { hashPassword } from '../utils/password'
import { requireSuperAdmin } from '../utils/require-admin'
import { toAccount } from '../utils/users'

const bodySchema = z.object({
   name: z.string().trim().max(120).nullish(),
   password: z.string().min(MIN_PASSWORD_LENGTH).max(256).optional(),
})

export default defineEventHandler(async (event): Promise<CmsAccount> => {
   await requireSuperAdmin(event)
   const id = getRouterParam(event, 'id') ?? ''
   const body = await readValidatedBody(event, bodySchema.parse)
   const set: Partial<typeof cms_users.$inferInsert> = { updatedAt: new Date().toISOString() }
   if (body.name !== undefined) set.name = body.name || null
   if (body.password) {
      set.passwordHash = await hashPassword(body.password)
      set.mustChangePassword = true
   }
   const [row] = await useDb().update(cms_users).set(set).where(eq(cms_users.id, id)).returning()
   if (!row) throw createError({ statusCode: 404, statusMessage: 'User not found' })
   return toAccount(row)
})
