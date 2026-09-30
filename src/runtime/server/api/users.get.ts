import { asc } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { useDb } from '#cms-db'
import { cms_users } from '#cms-tables'
import type { CmsAccount } from '../../shared/index'
import { requireSuperAdmin } from '../utils/require-admin'
import { toAccount } from '../utils/users'

export default defineEventHandler(async (event): Promise<CmsAccount[]> => {
   await requireSuperAdmin(event)
   const rows = await useDb().select().from(cms_users).orderBy(asc(cms_users.createdAt))
   return rows.map(toAccount)
})
