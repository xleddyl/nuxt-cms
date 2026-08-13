import { useDb } from '../utils/db-sqlite'
import { runCmsMigrations } from '../utils/migrate'

export default async () => {
   await runCmsMigrations(useDb())
}
