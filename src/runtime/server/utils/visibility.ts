import type { SQL } from 'drizzle-orm'
import { eq, isNotNull, lte } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { CmsEntry } from '../../shared/index'
import { CONTENT_PUBLISHED_AT_FIELD } from '../../shared/index'
import { nowTimestamp } from '../../shared/timestamps'

export function visibilityConditions(
   entry: Pick<CmsEntry, 'kind' | 'drafts'>,
   columns: Record<string, AnySQLiteColumn>,
   now: string = nowTimestamp()
): SQL[] {
   if (!entry.drafts) return []
   const conditions: SQL[] = []
   if (columns.status) conditions.push(eq(columns.status, 'published'))
   const publishedAt = columns[CONTENT_PUBLISHED_AT_FIELD]
   if (entry.kind === 'content' && publishedAt)
      conditions.push(isNotNull(publishedAt), lte(publishedAt, now))
   return conditions
}
