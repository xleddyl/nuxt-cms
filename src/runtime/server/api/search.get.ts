import { defineEventHandler, getValidatedQuery } from 'h3'
import { z } from 'zod'
import cmsConfig from '#cms-config'
import { cmsDialect, useDb } from '#cms-db'
import * as cmsTables from '#cms-tables'
import type { CmsConfig } from '../../shared/index'
import type { CmsSearchResponse } from '../../shared/search'
import { CMS_SEARCH_MAX_LENGTH } from '../../shared/search'
import { getContentI18n } from '../utils/registry'
import { requireAdmin } from '../utils/require-admin'
import type { SearchDb } from '../utils/search'
import { searchCms } from '../utils/search'

const querySchema = z.object({
   q: z.string().max(CMS_SEARCH_MAX_LENGTH).default(''),
})

export default defineEventHandler(async (event): Promise<CmsSearchResponse> => {
   await requireAdmin(event)
   const { q } = await getValidatedQuery(event, querySchema.parse)
   return searchCms({
      db: useDb() as unknown as SearchDb,
      dialect: cmsDialect,
      config: cmsConfig as CmsConfig,
      tables: cmsTables as Record<string, unknown>,
      i18n: getContentI18n(),
      query: q,
   })
})
