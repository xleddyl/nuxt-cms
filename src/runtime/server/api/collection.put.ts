import { createError, defineEventHandler, readValidatedBody } from 'h3'
import { useDb } from '#cms-db'
import { mapConstraintErrors } from '../utils/db-errors'
import { buildValidator, getRegistryEntry, idColumn, withUpdatedAt } from '../utils/registry'
import {
   assertRelationTargets,
   attachManyToMany,
   saveManyToMany,
   splitRelationValues,
} from '../utils/relations'
import { requireAdmin } from '../utils/require-admin'

export default defineEventHandler(async (event) => {
   await requireAdmin(event)
   const { name, entry, table } = getRegistryEntry(event)
   if (entry.kind !== 'single') {
      throw createError({ statusCode: 405, statusMessage: 'Collections are updated with PUT /:id' })
   }

   const body = await readValidatedBody(event, buildValidator(entry).parse)
   const { values, lists } = splitRelationValues(entry, body as Record<string, unknown>)
   await assertRelationTargets(entry, lists)
   const set = withUpdatedAt(table, values)

   return mapConstraintErrors(async () => {
      const [row] = await useDb()
         .insert(table)
         .values({ id: entry.id, ...set } as Record<string, unknown>)
         .onConflictDoUpdate({ target: idColumn(table), set })
         .returning()
      await saveManyToMany(name, entry.id, lists)
      const [attached] = await attachManyToMany(name, entry, [row as Record<string, unknown>])
      return attached
   })
})
