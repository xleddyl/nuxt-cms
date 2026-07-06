import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, readValidatedBody } from 'h3'
import { withTransaction } from '#cms-db'
import {
   buildValidator,
   getRegistryEntry,
   idColumn,
   parseId,
   withUpdatedAt,
} from '../utils/registry'
import {
   assertRelationTargets,
   attachManyToMany,
   saveManyToMany,
   splitRelationValues,
} from '../utils/relations'
import { requireAdmin } from '../utils/require-admin'
import { mapConstraintErrors } from '../utils/db-errors'

export default defineEventHandler(async (event) => {
   await requireAdmin(event)
   const { name, entry, table } = getRegistryEntry(event)
   if (entry.kind !== 'collection') {
      throw createError({
         statusCode: 405,
         statusMessage: 'Single objects are updated with PUT without id',
      })
   }

   const id = parseId(event)
   const body = await readValidatedBody(event, buildValidator(entry).parse)
   const { values, lists } = splitRelationValues(entry, body as Record<string, unknown>)
   await assertRelationTargets(entry, lists)
   const set = withUpdatedAt(table, values)

   return mapConstraintErrors(() =>
      withTransaction(async (db) => {
         const [row] = await db
            .update(table)
            .set(set)
            .where(eq(idColumn(table), id))
            .returning()
         if (!row) throw createError({ statusCode: 404, statusMessage: 'Row not found' })
         await saveManyToMany(db, name, id, lists)
         const [attached] = await attachManyToMany(db, name, entry, [
            row as Record<string, unknown>,
         ])
         return attached
      })
   )
})
