import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { useDb } from '#cms-db'
import { cms_users } from '#cms-tables'
import { replaceUserSession } from '#imports'
import { requireAdmin } from '../utils/require-admin'
import { sessionUserFor } from '../utils/users'

export default defineEventHandler(async (event) => {
   const user = await requireAdmin(event)
   if (!user.id) return { ok: true }
   const [row] = await useDb()
      .update(cms_users)
      .set({ mustChangePassword: false })
      .where(eq(cms_users.id, user.id))
      .returning()
   if (row) await replaceUserSession(event, { user: sessionUserFor(row) })
   return { ok: true }
})
