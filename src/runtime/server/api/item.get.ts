import { eq } from 'drizzle-orm'
import { createError, defineEventHandler } from 'h3'
import { useDb } from '#cms-db'
import {
   decodeRows,
   getRegistryEntry,
   idColumn,
   parseId,
   requirePageRoute,
} from '../utils/registry'
import { attachManyToMany } from '../utils/relations'
import { requireAdmin } from '../utils/require-admin'

export default defineEventHandler(async (event) => {
   await requireAdmin(event)
   const { name, entry, table } = getRegistryEntry(event)
   if (entry.kind === 'single') {
      throw createError({ statusCode: 404, statusMessage: 'Single objects have no items' })
   }

   const id = parseId(event)
   const db = useDb()
   const rows = await db
      .select()
      .from(table)
      .where(eq(idColumn(table), id))
      .limit(1)

   if (entry.kind === 'page') {
      const route = requirePageRoute(entry, id)
      if (!rows[0]) return { id: route.key, path: route.path }
      return decodeRows(entry, [rows[0] as Record<string, unknown>])[0]
   }

   if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Row not found' })

   const [attached] = await attachManyToMany(db, name, entry, [rows[0] as Record<string, unknown>])
   return decodeRows(entry, [attached!])[0]
})
