import { useDb } from '../utils/db-libsql'
import { runCmsMigrations } from '../utils/migrate'

export default async () => {
   await runCmsMigrations(useDb())
}
