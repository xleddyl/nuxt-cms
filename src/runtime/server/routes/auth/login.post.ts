import { createHash, timingSafeEqual } from 'node:crypto'
import { createError, defineEventHandler, getRequestIP, readValidatedBody } from 'h3'
import { z } from 'zod'
import { setUserSession, useRuntimeConfig } from '#imports'

const credentialsSchema = z.object({
   email: z.string().trim().min(1),
   password: z.string().min(1),
})

const RATE_WINDOW_MS = 15 * 60_000
const RATE_MAX_FAILURES = 10
const RATE_GLOBAL_MAX_FAILURES = 100
const RATE_PRUNE_THRESHOLD = 1000

const failures = new Map<string, { count: number; resetAt: number }>()
let globalFailures = { count: 0, resetAt: 0 }

function pruneFailures(now: number) {
   if (failures.size < RATE_PRUNE_THRESHOLD) return
   for (const [ip, entry] of failures) {
      if (entry.resetAt <= now) failures.delete(ip)
   }
}

function safeEqual(a: string, b: string) {
   const hashA = createHash('sha256').update(a).digest()
   const hashB = createHash('sha256').update(b).digest()
   return timingSafeEqual(hashA, hashB)
}

export default defineEventHandler(async (event) => {
   const ip = getRequestIP(event) ?? 'unknown'
   const now = Date.now()
   pruneFailures(now)
   if (globalFailures.resetAt > now && globalFailures.count >= RATE_GLOBAL_MAX_FAILURES) {
      throw createError({
         statusCode: 429,
         statusMessage: 'Too many failed attempts, try again later',
      })
   }
   const attempts = failures.get(ip)
   if (attempts && attempts.resetAt > now && attempts.count >= RATE_MAX_FAILURES) {
      throw createError({
         statusCode: 429,
         statusMessage: 'Too many failed attempts, try again later',
      })
   }

   const body = await readValidatedBody(event, credentialsSchema.parse)
   const { adminEmail, adminPassword } = useRuntimeConfig(event).cms as {
      adminEmail: string
      adminPassword: string
   }
   if (!adminEmail || !adminPassword) {
      throw createError({ statusCode: 403, statusMessage: 'Admin credentials are not configured' })
   }

   const emailOk = safeEqual(body.email.toLowerCase(), adminEmail.toLowerCase())
   const passwordOk = safeEqual(body.password, adminPassword)
   if (!emailOk || !passwordOk) {
      const current =
         attempts && attempts.resetAt > now ? attempts : { count: 0, resetAt: now + RATE_WINDOW_MS }
      current.count++
      failures.set(ip, current)
      if (globalFailures.resetAt <= now)
         globalFailures = { count: 0, resetAt: now + RATE_WINDOW_MS }
      globalFailures.count++
      throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
   }

   failures.delete(ip)
   await setUserSession(event, { user: { email: adminEmail.toLowerCase() } })
   return { loggedIn: true }
})
