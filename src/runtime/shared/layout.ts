import type { FieldConfig } from './index'

export const MAX_LAYOUT_ROW_FIELDS = 4

export type CmsLayoutRow = string | string[]

export interface CmsLayoutSectionInput {
   title: string
   description?: string
   collapsed?: boolean
   rows: CmsLayoutRow[]
}

export type CmsLayoutBlock = CmsLayoutRow | CmsLayoutSectionInput

export interface CmsLayoutSection {
   title?: string
   description?: string
   collapsed?: boolean
   rows: string[][]
}

export interface CmsFormLayout {
   main: CmsLayoutSection[]
}

export interface CmsListInput {
   columns?: string[]
}

export interface CmsEntrySettings {
   columns?: string[]
   layout?: CmsFormLayout
}

export type CmsSettingsMap = Record<string, CmsEntrySettings>

function isSectionInput(block: CmsLayoutBlock): block is CmsLayoutSectionInput {
   return typeof block === 'object' && !Array.isArray(block)
}

function toRow(row: CmsLayoutRow): string[] {
   return Array.isArray(row) ? [...row] : [row]
}

function sectionsFromBlocks(blocks: CmsLayoutBlock[] | undefined): CmsLayoutSection[] {
   const sections: CmsLayoutSection[] = []
   let loose: CmsLayoutSection | null = null
   for (const block of blocks ?? []) {
      if (isSectionInput(block)) {
         loose = null
         sections.push({
            title: block.title,
            ...(block.description ? { description: block.description } : {}),
            ...(block.collapsed ? { collapsed: true } : {}),
            rows: block.rows.map(toRow),
         })
         continue
      }
      if (!loose) {
         loose = { rows: [] }
         sections.push(loose)
      }
      loose.rows.push(toRow(block))
   }
   return sections
}

export function layoutFromConfig(input: CmsLayoutBlock[] | undefined): CmsFormLayout {
   return { main: sectionsFromBlocks(input) }
}

function cloneSection(section: CmsLayoutSection): CmsLayoutSection {
   return { ...section, rows: section.rows.map((row) => [...row]) }
}

export function resolveFormLayout(
   fields: Record<string, FieldConfig>,
   layout: CmsFormLayout | undefined
): CmsFormLayout {
   const known = new Set(Object.keys(fields))
   const mobileOf = new Map(
      Object.entries(fields)
         .filter(([, field]) => field.mobileOf && known.has(field.mobileOf))
         .map(([key, field]) => [field.mobileOf!, key])
   )
   const placed = new Set<string>()

   const clean = (sections: CmsLayoutSection[] | undefined) =>
      (sections ?? []).map(cloneSection).map((section) => ({
         ...section,
         rows: section.rows
            .map((row) =>
               row.filter((key) => {
                  if (!known.has(key) || placed.has(key)) return false
                  placed.add(key)
                  return true
               })
            )
            .filter((row) => row.length),
      }))

   const main = clean(layout?.main)

   for (const section of main) {
      for (let r = 0; r < section.rows.length; r++) {
         const row = section.rows[r]!
         for (const [parent, mobile] of mobileOf) {
            const index = row.indexOf(parent)
            if (index === -1 || placed.has(mobile)) continue
            if (row.length < MAX_LAYOUT_ROW_FIELDS) row.splice(index + 1, 0, mobile)
            else section.rows.splice(r + 1, 0, [mobile])
            placed.add(mobile)
         }
      }
   }

   const missing = Object.keys(fields).filter((key) => !placed.has(key))
   if (missing.length) {
      const rows: string[][] = []
      for (const key of missing) {
         if (placed.has(key)) continue
         const mobile = mobileOf.get(key)
         const row = mobile && !placed.has(mobile) ? [key, mobile] : [key]
         row.forEach((k) => placed.add(k))
         rows.push(row)
      }
      const last = main[main.length - 1]
      if (last && !last.title) last.rows.push(...rows)
      else main.push({ rows })
   }

   return { main }
}

export function defaultListColumns(
   fields: Record<string, FieldConfig>,
   list: CmsListInput | undefined,
   extra: string[] = []
): string[] {
   const available = [...Object.keys(fields), ...extra]
   const configured = list?.columns?.filter((key) => available.includes(key))
   if (configured?.length) return configured
   return [...Object.keys(fields).slice(0, 4), ...extra]
}

export function resolveListColumns(
   fields: Record<string, FieldConfig>,
   saved: string[] | undefined,
   list: CmsListInput | undefined,
   extra: string[] = []
): string[] {
   const available = new Set([...Object.keys(fields), ...extra])
   const kept = saved?.filter((key) => available.has(key))
   return kept?.length ? [...new Set(kept)] : defaultListColumns(fields, list, extra)
}

export function layoutErrors(
   at: string,
   fields: Record<string, FieldConfig>,
   input: CmsLayoutBlock[] | undefined
): string[] {
   if (!input) return []
   const errors: string[] = []
   if (!Array.isArray(input)) return [`${at}: layout must be an array of rows and sections`]
   const blocks = input
   const seen = new Set<string>()
   const checkRow = (row: CmsLayoutRow) => {
      const keys = toRow(row)
      if (!keys.length) errors.push(`${at}: layout has an empty row`)
      if (keys.length > MAX_LAYOUT_ROW_FIELDS)
         errors.push(
            `${at}: layout row [${keys.join(', ')}] has more than ${MAX_LAYOUT_ROW_FIELDS} fields`
         )
      for (const key of keys) {
         if (!Object.hasOwn(fields, key))
            errors.push(`${at}: layout names '${key}', which is not a declared field`)
         else if (seen.has(key)) errors.push(`${at}: layout names '${key}' more than once`)
         seen.add(key)
      }
   }
   for (const block of blocks) {
      if (isSectionInput(block)) {
         if (!block.title) errors.push(`${at}: every layout section needs a title`)
         if (!Array.isArray(block.rows))
            errors.push(`${at}: layout section '${block.title}' needs a rows array`)
         else block.rows.forEach(checkRow)
      } else {
         checkRow(block)
      }
   }
   return errors
}

export function listErrors(
   at: string,
   fields: Record<string, FieldConfig>,
   list: CmsListInput | undefined,
   extra: string[] = []
): string[] {
   if (!list?.columns) return []
   return list.columns
      .filter((key) => !Object.hasOwn(fields, key) && !extra.includes(key))
      .map((key) => `${at}: list.columns names '${key}', which is not a declared field`)
}
