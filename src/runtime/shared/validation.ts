import { z } from 'zod'
import type { CmsEntry, CmsI18n, FieldConfig } from './index'
import { isTranslatableField } from './index'

export const objectKeySchema = z
   .string()
   .min(1)
   .max(1024)
   .refine((k) => !k.includes('..') && !k.startsWith('/'), 'Invalid object key')

export interface ValidationMessages {
   required: string
   invalidDate: string
   invalidEmail: string
   invalidSlug: string
   unknownLocale: string
   requiredLocale: (locale: string) => string
}

const DEFAULT_MESSAGES: ValidationMessages = {
   required: 'Required field',
   invalidDate: 'Invalid date (yyyy-mm-dd)',
   invalidEmail: 'Invalid email',
   invalidSlug: 'Invalid slug (lowercase letters, numbers, dashes)',
   unknownLocale: 'Unknown locale key',
   requiredLocale: (locale) => `Required field (locale '${locale}')`,
}

function scalarSchema(field: FieldConfig, m: ValidationMessages): z.ZodType {
   switch (field.type) {
      case 'number':
         return field.integer ? z.number().int() : z.number()
      case 'boolean':
         return z.boolean()
      case 'relation':
         return z.string().min(1)
      case 'date':
         return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, m.invalidDate)
      case 'email':
         return z.email(m.invalidEmail)
      case 'slug':
         return z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, m.invalidSlug)
      case 'select':
         return z.enum(field.options as [string, ...string[]])
      case 'media':
         return objectKeySchema
      default:
         return field.required ? z.string().trim().min(1, m.required) : z.string()
   }
}

function optionalize(field: FieldConfig, base: z.ZodType): z.ZodType {
   return field.required ? base : base.nullish().transform((v) => v ?? null)
}

function blocksSchema(field: FieldConfig, m: ValidationMessages) {
   const variants = Object.entries(field.blocks ?? {}).map(([type, block]) =>
      z.object({
         type: z.literal(type),
         ...Object.fromEntries(
            Object.entries(block.fields).map(([key, blockField]) => [
               key,
               optionalize(blockField, scalarSchema(blockField, m)),
            ])
         ),
      })
   )
   return z.array(z.discriminatedUnion('type', variants as never))
}

export function buildEntrySchema(
   entry: Pick<CmsEntry, 'fields'> & { drafts?: boolean },
   i18n: CmsI18n,
   messages?: Partial<ValidationMessages>
) {
   const m: ValidationMessages = { ...DEFAULT_MESSAGES, ...messages }
   const { locales, defaultLocale } = i18n
   const shape: Record<string, z.ZodType> = {}
   for (const [key, field] of Object.entries(entry.fields)) {
      if (field.type === 'relation' && field.cardinality === 'many-to-many') {
         const list = z.array(z.string().min(1))
         shape[key] = field.required
            ? list.min(1, m.required)
            : list.nullish().transform((v) => v ?? [])
         continue
      }
      if (field.type === 'blocks') {
         const list = blocksSchema(field, m)
         shape[key] = field.required
            ? list.min(1, m.required)
            : list.nullish().transform((v) => v ?? null)
         continue
      }
      if (isTranslatableField(field) && locales.length) {
         const record = z
            .record(z.string(), z.string())
            .refine((v) => Object.keys(v).every((k) => locales.includes(k)), m.unknownLocale)
         shape[key] = field.required
            ? record.refine((v) => !!v[defaultLocale]?.trim(), m.requiredLocale(defaultLocale))
            : record.nullish().transform((v) => v ?? null)
         continue
      }
      if (field.type === 'json') {
         const json = z.unknown()
         shape[key] = field.required
            ? json.refine((v) => v !== undefined && v !== null, m.required)
            : json.nullish().transform((v) => v ?? null)
         continue
      }
      shape[key] = optionalize(field, scalarSchema(field, m))
   }
   if (entry.drafts) {
      shape.status = z
         .enum(['draft', 'published'])
         .nullish()
         .transform((v) => v ?? undefined)
   }
   return z.object(shape)
}
