import { createError, isError } from 'h3'

const FK_CODES = new Set(['SQLITE_CONSTRAINT_FOREIGNKEY', '23503'])
const UNIQUE_CODES = new Set(['SQLITE_CONSTRAINT_UNIQUE', 'SQLITE_CONSTRAINT_PRIMARYKEY', '23505'])
const NOT_NULL_CODES = new Set(['SQLITE_CONSTRAINT_NOTNULL', '23502'])

export async function mapConstraintErrors<T>(run: () => Promise<T>): Promise<T> {
   try {
      return await run()
   } catch (error) {
      if (isError(error)) throw error
      const code = (error as { code?: string })?.code ?? ''
      if (FK_CODES.has(code)) {
         throw createError({
            statusCode: 409,
            statusMessage:
               'Operation conflicts with a relation: a referenced entry is missing or this entry is still referenced',
         })
      }
      if (UNIQUE_CODES.has(code)) {
         throw createError({
            statusCode: 409,
            statusMessage: 'Duplicate value for a unique field',
         })
      }
      if (NOT_NULL_CODES.has(code)) {
         throw createError({
            statusCode: 422,
            statusMessage: 'A required field is missing',
         })
      }
      throw error
   }
}
