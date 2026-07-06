import { eq } from 'drizzle-orm'
import { createError, defineEventHandler } from 'h3'
import { useDb } from '#cms-db'
import { getRegistryEntry, idColumn, parseId } from '../utils/registry'
import { attachManyToMany } from '../utils/relations'
import { requireAdmin } from '../utils/require-admin'

export default defineEventHandler(async (event) => {
   await requireAdmin(event)
   const { name, entry, table } = getRegistryEntry(event)
   if (entry.kind !== 'collection') {
      throw createError({ statusCode: 404, statusMessage: 'Single objects have no items' })
   }

   const id = parseId(event)
   const rows = await useDb()
      .select()
      .from(table)
      .where(eq(idColumn(table), id))
      .limit(1)
   if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Row not found' })

   const [attached] = await attachManyToMany(name, entry, [rows[0] as Record<string, unknown>])
   return attached
})
