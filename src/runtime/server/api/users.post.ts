import { createError, defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { useDb } from '#cms-db'
import { cms_users } from '#cms-tables'
import type { CmsAccount } from '../../shared/index'
import { MIN_PASSWORD_LENGTH } from '../../shared/index'
import { customId } from '../utils/custom-id'
import { mapConstraintErrors } from '../utils/db-errors'
import { hashPassword } from '../utils/password'
import { isSuperAdminEmail, requireSuperAdmin } from '../utils/require-admin'
import { findUserByEmail, toAccount } from '../utils/users'

const bodySchema = z.object({
   email: z.string().trim().toLowerCase().email().max(254),
   name: z.string().trim().max(120).nullish(),
   password: z.string().min(MIN_PASSWORD_LENGTH).max(256),
})

export default defineEventHandler(async (event): Promise<CmsAccount> => {
   await requireSuperAdmin(event)
   const body = await readValidatedBody(event, bodySchema.parse)
   if (isSuperAdminEmail(event, body.email) || (await findUserByEmail(body.email))) {
      throw createError({ statusCode: 409, statusMessage: 'A user with this email already exists' })
   }
   const now = new Date().toISOString()
   const passwordHash = await hashPassword(body.password)
   const [row] = await mapConstraintErrors(() =>
      useDb()
         .insert(cms_users)
         .values({
            id: customId('usr'),
            email: body.email,
            name: body.name || null,
            role: 'admin',
            passwordHash,
            createdAt: now,
            updatedAt: now,
         })
         .returning()
   )
   return toAccount(row!)
})
