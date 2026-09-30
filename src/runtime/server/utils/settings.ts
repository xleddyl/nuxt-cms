import type { H3Event } from 'h3'
import { createError, getRouterParam } from 'h3'
import { z } from 'zod'
import cmsConfig from '#cms-config'
import type { CmsEntrySettings } from '../../shared/index'

const fieldKey = z.string().min(1).max(128)

const sectionSchema = z.object({
   title: z.string().max(200).optional(),
   description: z.string().max(1000).optional(),
   collapsed: z.boolean().optional(),
   rows: z.array(z.array(fieldKey).max(4)).max(500),
})

export const entrySettingsSchema = z
   .object({
      columns: z.array(fieldKey).max(200).optional(),
      layout: z
         .object({
            main: z.array(sectionSchema).max(100),
         })
         .optional(),
   })
   .strict()

export function requireSettingsKey(event: H3Event): string {
   const key = getRouterParam(event, 'key') ?? ''
   if (!Object.hasOwn(cmsConfig, key)) {
      throw createError({ statusCode: 404, statusMessage: `Unknown entry: ${key}` })
   }
   return key
}

export function parseSettingsValue(raw: string): CmsEntrySettings | null {
   try {
      const parsed = entrySettingsSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : null
   } catch {
      return null
   }
}
