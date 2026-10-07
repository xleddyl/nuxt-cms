import type { BlockConfig, CmsConfig, CmsEntry, CmsEntryKind, FieldConfig } from './index'
import { entryTabs, fieldTab, pageAllFields, pageRoutes } from './index'

export const CMS_SEARCH_MIN_LENGTH = 2

export const CMS_SEARCH_MAX_LENGTH = 200

export const CMS_SEARCH_LABEL_LIMIT = 20

export const CMS_SEARCH_VALUE_LIMIT = 50

export const CMS_SEARCH_ROWS_PER_ENTRY = 10

export const CMS_SEARCH_HITS_PER_ROW = 5

export const CMS_SEARCH_PATH_SEPARATOR = ' › '

export type CmsSearchHitType = 'entry' | 'page' | 'tab' | 'field' | 'block' | 'value' | 'media'

export type CmsSearchKind = CmsEntryKind | 'media'

export interface CmsSearchSnippet {
   before: string
   match: string
   after: string
}

export interface CmsSearchHit {
   type: CmsSearchHitType
   collection: string | null
   entryLabel: string
   kind: CmsSearchKind
   id: string | null
   title: string | null
   field: string | null
   fieldLabel: string | null
   locale: string | null
   snippet: CmsSearchSnippet
   to: string
}

export interface CmsSearchResponse {
   query: string
   hits: CmsSearchHit[]
   truncated: boolean
}

export interface CmsSearchFocus {
   field?: string
   locale?: string | null
   block?: number | null
   tab?: string
}

const SNIPPET_BEFORE = 40
const SNIPPET_AFTER = 90

const ENTITIES: Record<string, string> = {
   amp: '&',
   lt: '<',
   gt: '>',
   quot: '"',
   apos: "'",
   nbsp: ' ',
}

export function normalizeSearchQuery(value: string): string {
   return value.replace(/\s+/g, ' ').trim().slice(0, CMS_SEARCH_MAX_LENGTH)
}

export function isSearchableQuery(value: string): boolean {
   return normalizeSearchQuery(value).length >= CMS_SEARCH_MIN_LENGTH
}

export function searchLikePattern(term: string): string {
   return `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
}

export function decodeHtmlEntities(value: string): string {
   return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (code[0] === '#') {
         const point =
            code[1] === 'x' || code[1] === 'X'
               ? Number.parseInt(code.slice(2), 16)
               : Number.parseInt(code.slice(1), 10)
         return Number.isFinite(point) && point > 0 && point <= 0x10ffff
            ? String.fromCodePoint(point)
            : entity
      }
      return ENTITIES[code.toLowerCase()] ?? entity
   })
}

export function stripMarkup(html: string): string {
   return decodeHtmlEntities(
      html
         .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
         .replace(/<\/?(p|div|li|ul|ol|h[1-6]|blockquote|pre|br|hr|tr|td|th)\b[^>]*>/gi, ' ')
         .replace(/<[^>]*>/g, '')
   )
}

export function searchSnippet(text: string, term: string): CmsSearchSnippet | null {
   const normalized = text.replace(/\s+/g, ' ').trim()
   const needle = normalizeSearchQuery(term).toLowerCase()
   if (!needle) return null
   const index = normalized.toLowerCase().indexOf(needle)
   if (index === -1) return null
   const end = index + needle.length
   const from = Math.max(0, index - SNIPPET_BEFORE)
   const to = Math.min(normalized.length, end + SNIPPET_AFTER)
   return {
      before: `${from > 0 ? '…' : ''}${normalized.slice(from, index).trimStart()}`,
      match: normalized.slice(index, end),
      after: `${normalized.slice(end, to).trimEnd()}${to < normalized.length ? '…' : ''}`,
   }
}

export function searchFieldPath(...labels: string[]): string {
   return labels.join(CMS_SEARCH_PATH_SEPARATOR)
}

export function cmsSearchLink(path: string, focus: CmsSearchFocus = {}): string {
   const params = new URLSearchParams()
   if (focus.field) params.set('field', focus.field)
   if (focus.locale) params.set('locale', focus.locale)
   if (focus.block != null) params.set('block', String(focus.block))
   if (focus.tab) params.set('tab', focus.tab)
   const query = params.toString()
   return query ? `${path}?${query}` : path
}

export function readSearchFocus(query: Record<string, unknown>): CmsSearchFocus | null {
   const text = (value: unknown) => {
      const first = Array.isArray(value) ? value[0] : value
      return typeof first === 'string' && first ? first : undefined
   }
   const field = text(query.field)
   const tab = text(query.tab)
   if (!field && !tab) return null
   const block = Number.parseInt(text(query.block) ?? '', 10)
   return {
      ...(field ? { field } : {}),
      ...(tab ? { tab } : {}),
      locale: text(query.locale) ?? null,
      block: Number.isInteger(block) && block >= 0 ? block : null,
   }
}

interface LabelCandidate {
   type: CmsSearchHitType
   id?: string | null
   title?: string | null
   field?: string | null
   fieldLabel?: string | null
   texts: string[]
   to: string
}

function entryPath(name: string) {
   return `/cms/${name}`
}

function fieldLink(
   name: string,
   entry: CmsEntry,
   key: string,
   overridePaths: string[]
): { to: string; id: string | null; title: string | null } {
   if (entry.kind === 'single') {
      return { to: cmsSearchLink(entryPath(name), { field: key }), id: null, title: null }
   }
   if (entry.kind === 'page' && !Object.hasOwn(entry.fields, key) && overridePaths.length === 1) {
      const route = pageRoutes(entry).find((candidate) => candidate.path === overridePaths[0])
      if (route) {
         return {
            to: cmsSearchLink(`${entryPath(name)}/${route.key}`, { field: key }),
            id: route.key,
            title: route.label,
         }
      }
   }
   return { to: entryPath(name), id: null, title: null }
}

function overridePathsOf(entry: CmsEntry, key: string): string[] {
   return Object.entries(entry.overrides ?? {})
      .filter(([, fields]) => !!fields[key])
      .map(([path]) => path)
}

function blockCandidates(
   key: string,
   field: FieldConfig,
   link: { to: string; id: string | null; title: string | null }
): LabelCandidate[] {
   const candidates: LabelCandidate[] = []
   for (const block of Object.values(field.blocks ?? {}) as BlockConfig[]) {
      candidates.push({
         type: 'block',
         ...link,
         field: key,
         fieldLabel: searchFieldPath(field.label, block.label),
         texts: [block.label],
      })
      for (const blockField of Object.values(block.fields)) {
         candidates.push({
            type: 'field',
            ...link,
            field: key,
            fieldLabel: searchFieldPath(field.label, block.label, blockField.label),
            texts: [blockField.label],
         })
      }
   }
   return candidates
}

function labelCandidates(name: string, entry: CmsEntry): LabelCandidate[] {
   const candidates: LabelCandidate[] = [
      { type: 'entry', texts: [entry.label], to: entryPath(name) },
   ]
   if (entry.kind === 'page') {
      for (const route of pageRoutes(entry)) {
         candidates.push({
            type: 'page',
            id: route.key,
            title: route.label,
            texts: [route.label, route.path],
            to: `${entryPath(name)}/${route.key}`,
         })
      }
   }
   for (const tab of entryTabs(entry)) {
      candidates.push({
         type: 'tab',
         fieldLabel: tab.label,
         texts: [tab.label],
         to:
            entry.kind === 'single'
               ? cmsSearchLink(entryPath(name), { tab: tab.id })
               : entryPath(name),
      })
   }
   const fields = entry.kind === 'page' ? pageAllFields(entry) : entry.fields
   const tabs = entryTabs(entry)
   for (const [key, field] of Object.entries(fields)) {
      const link = fieldLink(name, entry, key, overridePathsOf(entry, key))
      candidates.push({
         type: 'field',
         ...link,
         field: key,
         fieldLabel: tabs.length
            ? searchFieldPath(
                 tabs.find((tab) => tab.id === fieldTab(field, tabs))?.label ?? '',
                 field.label
              )
            : field.label,
         texts: [field.label],
      })
      if (field.type === 'blocks') candidates.push(...blockCandidates(key, field, link))
   }
   return candidates
}

export function searchCmsLabels(
   config: CmsConfig,
   query: string,
   limit: number = CMS_SEARCH_LABEL_LIMIT
): { hits: CmsSearchHit[]; truncated: boolean } {
   const term = normalizeSearchQuery(query)
   if (term.length < CMS_SEARCH_MIN_LENGTH) return { hits: [], truncated: false }
   const needle = term.toLowerCase()
   const scored: { hit: CmsSearchHit; score: number }[] = []
   const seen = new Set<string>()
   for (const [name, entry] of Object.entries(config)) {
      for (const candidate of labelCandidates(name, entry)) {
         const text = candidate.texts.find((value) => value.toLowerCase().includes(needle))
         if (!text) continue
         const snippet = searchSnippet(text, term)
         if (!snippet) continue
         const identity = [candidate.type, name, candidate.fieldLabel ?? '', candidate.to].join(
            '\u0000'
         )
         if (seen.has(identity)) continue
         seen.add(identity)
         scored.push({
            score: text.toLowerCase().startsWith(needle) ? 0 : 1,
            hit: {
               type: candidate.type,
               collection: name,
               entryLabel: entry.label,
               kind: entry.kind,
               id: candidate.id ?? null,
               title: candidate.title ?? null,
               field: candidate.field ?? null,
               fieldLabel: candidate.fieldLabel ?? null,
               locale: null,
               snippet,
               to: candidate.to,
            },
         })
      }
   }
   const sorted = scored
      .map((item, index) => ({ ...item, index }))
      .sort((a, b) => a.score - b.score || a.index - b.index)
      .map((item) => item.hit)
   return { hits: sorted.slice(0, limit), truncated: sorted.length > limit }
}
