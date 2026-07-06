import { existsSync } from 'node:fs'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { useRuntimeConfig } from '#imports'
import { useDb } from '../utils/db-sqlite'

export default () => {
   const { migrationsDir } = useRuntimeConfig().cms as { migrationsDir: string }
   if (!existsSync(migrationsDir)) return
   migrate(useDb(), { migrationsFolder: migrationsDir })
}
