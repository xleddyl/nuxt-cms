import { createHash, timingSafeEqual } from 'node:crypto'
import { createError, defineEventHandler, getRequestIP, readValidatedBody } from 'h3'
import { z } from 'zod'
import { replaceUserSession, useRuntimeConfig, useStorage } from '#imports'
import { eq } from 'drizzle-orm'
import { useDb } from '#cms-db'
import { cms_users } from '#cms-tables'
import { verifyNothing, verifyPassword } from '../../utils/password'
import { assertSameOrigin } from '../../utils/same-origin'
import { findUserByEmail, sessionUserFor } from '../../utils/users'

const credentialsSchema = z.object({
   email: z.string().trim().min(1).max(254),
   password: z.string().min(1).max(256),
})

const RATE_LOCK_MS = 5 * 60_000
const RATE_MAX_FAILURES = 5
const RATE_PRUNE_EVERY = 200

interface RateEntry {
   count: number
   resetAt: number
}

let writesSincePrune = 0

function rateStorage() {
   return useStorage('cms:login-rate')
}

function rateKey(kind: 'ip' | 'email', value: string) {
   return `${kind}:${value.replace(/[^a-z0-9]/gi, '-')}`
}

async function readEntry(key: string, now: number): Promise<RateEntry | null> {
   const entry = await rateStorage().getItem<RateEntry>(key)
   return entry && entry.resetAt > now ? entry : null
}

function isLocked(entry: RateEntry | null) {
   return !!entry && entry.count >= RATE_MAX_FAILURES
}

async function recordAttempt(key: string, now: number) {
   const current = (await readEntry(key, now)) ?? { count: 0, resetAt: now + RATE_LOCK_MS }
   current.count++
   if (current.count >= RATE_MAX_FAILURES) current.resetAt = now + RATE_LOCK_MS
   await rateStorage().setItem(key, current, {
      ttl: Math.ceil((current.resetAt - now) / 1000),
   })
}

async function prune(now: number) {
   if (++writesSincePrune < RATE_PRUNE_EVERY) return
   writesSincePrune = 0
   const storage = rateStorage()
   const keys = await storage.getKeys()
   await Promise.all(
      keys.map(async (key) => {
         const entry = await storage.getItem<RateEntry>(key)
         if (!entry || entry.resetAt <= now) await storage.removeItem(key)
      })
   )
}

async function clearAttempts(keys: string[]) {
   await Promise.all(keys.map((key) => rateStorage().removeItem(key)))
}

function tooManyAttempts() {
   return createError({
      statusCode: 429,
      statusMessage: 'Too many failed attempts, try again in 5 minutes',
   })
}

function safeEqual(a: string, b: string) {
   const hashA = createHash('sha256').update(a).digest()
   const hashB = createHash('sha256').update(b).digest()
   return timingSafeEqual(hashA, hashB)
}

export default defineEventHandler(async (event) => {
   assertSameOrigin(event)
   const now = Date.now()
   const body = await readValidatedBody(event, credentialsSchema.parse)
   const email = body.email.toLowerCase()
   const keys = [
      rateKey('ip', getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'),
      rateKey('email', email),
   ]

   const entries = await Promise.all(keys.map((key) => readEntry(key, now)))
   if (entries.some(isLocked)) throw tooManyAttempts()
   await Promise.all([...keys.map((key) => recordAttempt(key, now)), prune(now)])
   const { adminEmail, adminPassword } = useRuntimeConfig(event).cms as {
      adminEmail: string
      adminPassword: string
   }

   const superAdmin =
      !!adminEmail &&
      !!adminPassword &&
      safeEqual(email, adminEmail.toLowerCase()) &&
      safeEqual(body.password, adminPassword)

   if (superAdmin) {
      await clearAttempts(keys)
      await replaceUserSession(event, { user: { email, role: 'superadmin' } })
      return { loggedIn: true }
   }

   const row = await findUserByEmail(email)
   const passwordOk = row
      ? await verifyPassword(row.passwordHash, body.password)
      : await verifyNothing(body.password)
   if (!row || !passwordOk) {
      throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
   }

   await clearAttempts(keys)
   await useDb()
      .update(cms_users)
      .set({ lastLoginAt: new Date().toISOString() })
      .where(eq(cms_users.id, row.id))
   await replaceUserSession(event, { user: sessionUserFor(row) })
   return { loggedIn: true }
})
