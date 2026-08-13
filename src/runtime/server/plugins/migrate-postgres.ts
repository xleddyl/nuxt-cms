import { useDb } from '../utils/db-postgres'
import { runCmsMigrations } from '../utils/migrate'

export default async () => {
   await runCmsMigrations(useDb())
}
