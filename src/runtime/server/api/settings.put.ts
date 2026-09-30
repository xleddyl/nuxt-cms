import { defineEventHandler, readValidatedBody } from 'h3'
import { useDb } from '#cms-db'
import { cms_settings } from '#cms-tables'
import type { CmsEntrySettings } from '../../shared/index'
import { requireAdmin } from '../utils/require-admin'
import { entrySettingsSchema, requireSettingsKey } from '../utils/settings'

export default defineEventHandler(async (event): Promise<CmsEntrySettings> => {
   await requireAdmin(event)
   const key = requireSettingsKey(event)
   const body = await readValidatedBody(event, entrySettingsSchema.parse)
   const value = JSON.stringify(body)
   const updatedAt = new Date().toISOString()
   await useDb()
      .insert(cms_settings)
      .values({ key, value, updatedAt })
      .onConflictDoUpdate({ target: cms_settings.key, set: { value, updatedAt } })
   return body
})
