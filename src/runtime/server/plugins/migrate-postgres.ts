import { existsSync } from 'node:fs'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { useRuntimeConfig } from '#imports'
import { useDb } from '../utils/db-postgres'

export default async () => {
   const { migrationsDir } = useRuntimeConfig().cms as { migrationsDir: string }
   if (!existsSync(migrationsDir)) return
   await migrate(useDb(), { migrationsFolder: migrationsDir })
}
