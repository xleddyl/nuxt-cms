import { createError, defineEventHandler, readValidatedBody } from 'h3'
import { useDb } from '#cms-db'
import { customId } from '../utils/custom-id'
import { mapConstraintErrors } from '../utils/db-errors'
import { buildValidator, getRegistryEntry } from '../utils/registry'
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
   if (entry.kind !== 'collection') {
      throw createError({ statusCode: 405, statusMessage: 'Single objects are updated with PUT' })
   }

   const body = (await readValidatedBody(event, buildValidator(entry).parse)) as Record<
      string,
      unknown
   >
   const { values, lists } = splitRelationValues(entry, body)
   await assertRelationTargets(entry, lists)
   if (entry.drafts) values.status ??= 'draft'
   values.id = customId(entry.id)
   return mapConstraintErrors(async () => {
      const [row] = await useDb().insert(table).values(values).returning()
      await saveManyToMany(name, (row as Record<string, unknown>).id as string, lists)
      const [attached] = await attachManyToMany(name, entry, [row as Record<string, unknown>])
      return attached
   })
})
