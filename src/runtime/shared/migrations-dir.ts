import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATIONS_ROOT = 'server/db/migrations'

export function migrationsDirFor(root: string, driver: string): string {
   if (driver === 'postgres') return resolve(root, `${MIGRATIONS_ROOT}/postgres`)
   const perDriver = resolve(root, `${MIGRATIONS_ROOT}/${driver}`)
   if (driver !== 'sqlite' && existsSync(perDriver)) return perDriver
   return resolve(root, `${MIGRATIONS_ROOT}/sqlite`)
}
