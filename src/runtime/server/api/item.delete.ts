import { eq } from 'drizzle-orm'
import { createError, defineEventHandler } from 'h3'
import { useDb } from '#cms-db'
import { mapConstraintErrors } from '../utils/db-errors'
import { getRegistryEntry, idColumn, parseId } from '../utils/registry'
import { requireAdmin } from '../utils/require-admin'

export default defineEventHandler(async (event) => {
   await requireAdmin(event)
   const { entry, table } = getRegistryEntry(event)
   if (entry.kind !== 'collection') {
      throw createError({ statusCode: 405, statusMessage: 'Single objects cannot be deleted' })
   }

   const id = parseId(event)
   return mapConstraintErrors(async () => {
      const [row] = await useDb()
         .delete(table)
         .where(eq(idColumn(table), id))
         .returning()
      if (!row) throw createError({ statusCode: 404, statusMessage: 'Row not found' })
      return { deleted: true }
   })
})
