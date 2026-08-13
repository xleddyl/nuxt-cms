import type { NitroApp } from 'nitropack/types'
import { setD1Env, useD1Binding } from '../utils/db-d1'
import { runD1Migrations } from '../utils/migrate'

let migrated: Promise<void> | null = null

export default (nitroApp: NitroApp) => {
   nitroApp.hooks.hook('request', async (event) => {
      const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } } | undefined)
         ?.cloudflare?.env
      if (!env) return

      setD1Env(env)
      migrated ??= runD1Migrations(useD1Binding()).catch((error: unknown) => {
         migrated = null
         throw error
      })
      await migrated
   })
}
