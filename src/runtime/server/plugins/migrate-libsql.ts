import { existsSync } from 'node:fs'
import { migrate } from 'drizzle-orm/libsql/migrator'
import cmsConfig from '#cms-config'
import { useRuntimeConfig } from '#imports'
import { useDb } from '../utils/db-libsql'

export default async () => {
   const { migrationsDir } = useRuntimeConfig().cms as { migrationsDir: string }
   if (!existsSync(migrationsDir)) {
      if (Object.keys(cmsConfig).length) {
         console.error(
            `[nuxt-cms] Migrations folder not found: ${migrationsDir}. CMS tables may be missing — run the dev server once and deploy the generated server/db/migrations folder.`
         )
      }
      return
   }
   await migrate(useDb(), { migrationsFolder: migrationsDir })
}
