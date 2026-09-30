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
   email: z.string().trim().min(1),
   password: z.string().min(1),
})

const RATE_WINDOW_MS = 15 * 60_000
const RATE_MAX_FAILURES = 10
const RATE_GLOBAL_MAX_FAILURES = 100
const RATE_PRUNE_EVERY = 200
const GLOBAL_KEY = 'global'

interface RateEntry {
   count: number
   resetAt: number
}

let writesSincePrune = 0

function rateStorage() {
   return useStorage('cms:login-rate')
}

function rateKey(ip: string) {
   return ip.replace(/[^a-z0-9]/gi, '-')
}

async function readEntry(key: string, now: number): Promise<RateEntry | null> {
   const entry = await rateStorage().getItem<RateEntry>(key)
   return entry && entry.resetAt > now ? entry : null
}

async function recordFailure(key: string, now: number) {
   const current = (await readEntry(key, now)) ?? { count: 0, resetAt: now + RATE_WINDOW_MS }
   current.count++
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

function safeEqual(a: string, b: string) {
   const hashA = createHash('sha256').update(a).digest()
   const hashB = createHash('sha256').update(b).digest()
   return timingSafeEqual(hashA, hashB)
}

export default defineEventHandler(async (event) => {
   assertSameOrigin(event)
   const ip = rateKey(getRequestIP(event, { xForwardedFor: true }) ?? 'unknown')
   const now = Date.now()

   const [attempts, globalFailures] = await Promise.all([
      readEntry(ip, now),
      readEntry(GLOBAL_KEY, now),
   ])
   if (
      (globalFailures && globalFailures.count >= RATE_GLOBAL_MAX_FAILURES) ||
      (attempts && attempts.count >= RATE_MAX_FAILURES)
   ) {
      throw createError({
         statusCode: 429,
         statusMessage: 'Too many failed attempts, try again later',
      })
   }

   const body = await readValidatedBody(event, credentialsSchema.parse)
   const email = body.email.toLowerCase()
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
      await rateStorage().removeItem(ip)
      await replaceUserSession(event, { user: { email, role: 'superadmin' } })
      return { loggedIn: true }
   }

   const row = await findUserByEmail(email)
   const passwordOk = row
      ? await verifyPassword(row.passwordHash, body.password)
      : await verifyNothing(body.password)
   if (!row || !passwordOk) {
      await Promise.all([recordFailure(ip, now), recordFailure(GLOBAL_KEY, now), prune(now)])
      throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
   }

   await rateStorage().removeItem(ip)
   await useDb()
      .update(cms_users)
      .set({ lastLoginAt: new Date().toISOString() })
      .where(eq(cms_users.id, row.id))
   await replaceUserSession(event, { user: sessionUserFor(row) })
   return { loggedIn: true }
})
