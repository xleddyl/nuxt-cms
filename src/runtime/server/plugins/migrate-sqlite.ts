import { useDb } from '../utils/db-sqlite'
import { runSqliteMigrations } from '../utils/migrate'

export default async () => {
   await runSqliteMigrations(useDb())
}
