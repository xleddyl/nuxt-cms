import { eq } from 'drizzle-orm'
import { useDb } from '#cms-db'
import { cms_users } from '#cms-tables'
import type { CmsAccount, CmsUserRole } from '../../shared/index'
import { normalizeTimestamp } from '../../shared/timestamps'

export type CmsUserRow = typeof cms_users.$inferSelect

export async function findUserByEmail(email: string): Promise<CmsUserRow | undefined> {
   const [row] = await useDb()
      .select()
      .from(cms_users)
      .where(eq(cms_users.email, email.toLowerCase()))
   return row
}

export async function findUserById(id: string): Promise<CmsUserRow | undefined> {
   const [row] = await useDb().select().from(cms_users).where(eq(cms_users.id, id))
   return row
}

export function passwordStamp(passwordHash: string) {
   return passwordHash.slice(-16)
}

export function sessionUserFor(row: CmsUserRow) {
   return {
      id: row.id,
      email: row.email,
      name: row.name ?? null,
      role: 'admin' as const,
      firstLogin: !!row.mustChangePassword,
      passwordStamp: passwordStamp(row.passwordHash),
   }
}

export function toAccount(row: CmsUserRow): CmsAccount {
   return {
      id: row.id,
      email: row.email,
      name: row.name ?? null,
      role: row.role as CmsUserRole,
      lastLoginAt: normalizeTimestamp(row.lastLoginAt ?? null),
      createdAt: String(normalizeTimestamp(row.createdAt)),
   }
}
