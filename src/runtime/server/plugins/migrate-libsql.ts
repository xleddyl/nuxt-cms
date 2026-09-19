import { useDb } from '../utils/db-libsql'
import { runLibsqlMigrations } from '../utils/migrate'

export default async () => {
   await runLibsqlMigrations(useDb())
}
