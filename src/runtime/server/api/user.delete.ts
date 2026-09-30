import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { useDb } from '#cms-db'
import { cms_users } from '#cms-tables'
import { requireSuperAdmin } from '../utils/require-admin'

export default defineEventHandler(async (event) => {
   await requireSuperAdmin(event)
   const id = getRouterParam(event, 'id') ?? ''
   const [row] = await useDb().delete(cms_users).where(eq(cms_users.id, id)).returning()
   if (!row) throw createError({ statusCode: 404, statusMessage: 'User not found' })
   return { ok: true }
})
