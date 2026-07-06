import { desc } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { useDb } from '#cms-db'
import { getRegistryEntry, idColumn, tableColumns } from '../utils/registry'
import { attachManyToMany } from '../utils/relations'
import { requireAdmin } from '../utils/require-admin'

export default defineEventHandler(async (event) => {
   await requireAdmin(event)
   const { name, entry, table } = getRegistryEntry(event)
   const db = useDb()

   if (entry.kind === 'single') {
      const rows = await db.select().from(table).limit(1)
      await attachManyToMany(name, entry, rows)
      return rows[0] ?? null
   }

   const orderBy = tableColumns(table).createdAt ?? idColumn(table)
   const rows = await db.select().from(table).orderBy(desc(orderBy))
   return attachManyToMany(name, entry, rows)
})
