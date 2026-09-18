import type { PgTable } from 'drizzle-orm/pg-core'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'

export type CmsTable = SQLiteTable | PgTable

export type FieldType =
   | 'text'
   | 'richtext'
   | 'number'
   | 'boolean'
   | 'date'
   | 'email'
   | 'slug'
   | 'select'
   | 'json'
   | 'media'
   | 'relation'
   | 'blocks'

export interface CmsI18n {
   locales: string[]
   defaultLocale: string
}

export type MediaStorageMode = 's3' | 'local'

export const MEDIA_TYPES = ['image', 'video', 'file'] as const

export type MediaType = (typeof MEDIA_TYPES)[number]

const MEDIA_EXTENSIONS: Record<Exclude<MediaType, 'file'>, string[]> = {
   image: [
      'apng',
      'avif',
      'bmp',
      'gif',
      'heic',
      'ico',
      'jpeg',
      'jpg',
      'png',
      'svg',
      'tif',
      'tiff',
      'webp',
   ],
   video: ['avi', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'ogv', 'webm'],
}

export function mediaTypeForKey(key: string): MediaType {
   const dot = key.lastIndexOf('.')
   if (dot === -1) return 'file'
   const ext = key.slice(dot + 1).toLowerCase()
   if (MEDIA_EXTENSIONS.image.includes(ext)) return 'image'
   if (MEDIA_EXTENSIONS.video.includes(ext)) return 'video'
   return 'file'
}

export function mediaFilename(key: string) {
   const base = key.split('/').pop() ?? key
   return base.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '')
}

export function mediaTypeFor(mime: string | null | undefined, key: string): MediaType {
   if (mime?.startsWith('image/')) return 'image'
   if (mime?.startsWith('video/')) return 'video'
   if (mime) return 'file'
   return mediaTypeForKey(key)
}

export function mediaIconFor(type: MediaType): string {
   return type === 'image' ? 'photo' : type === 'video' ? 'film' : 'document'
}

export function mediaTypeFilter(
   mediaType: MediaType | MediaType[] | null | undefined
): MediaType[] | null {
   const requested = Array.isArray(mediaType) ? mediaType : mediaType ? [mediaType] : []
   const types = [...new Set(requested.filter((type) => MEDIA_TYPES.includes(type)))]
   if (!types.length || types.includes('file')) return null
   return types
}

export function mediaTypeAccept(
   mediaType: MediaType | MediaType[] | null | undefined
): string[] | null {
   const types = mediaTypeFilter(mediaType)
   return types ? types.map((type) => `${type}/*`) : null
}

export function mediaPublicUrl(baseUrl: string | null | undefined, key: string): string | null {
   return baseUrl ? `${baseUrl.replace(/\/+$/, '')}/${key}` : null
}

export const DEFAULT_MEDIA_MAX_FILE_SIZE = 10 * 1024 * 1024

const FILE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

export function formatFileSize(bytes: number): string {
   let value = Math.max(0, bytes)
   let unit = 0
   while (value >= 1024 && unit < FILE_SIZE_UNITS.length - 1) {
      value /= 1024
      unit++
   }
   return `${Math.round(value * 10) / 10} ${FILE_SIZE_UNITS[unit]}`
}

export function slugify(value: string): string {
   return value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036F]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
}

export const MEDIA_FOLDER_MAX_DEPTH = 4

export const MEDIA_FOLDER_MARKER = '.keep'

export function mediaFolderMarkerKey(folder: string) {
   return `${folder}/${MEDIA_FOLDER_MARKER}`
}

export function isMediaFolderMarker(key: string) {
   return key.endsWith(`/${MEDIA_FOLDER_MARKER}`)
}

export function normalizeMediaFolder(value: string | null | undefined): string | null {
   if (!value) return null
   const segments = value.split('/').map(slugify).filter(Boolean).slice(0, MEDIA_FOLDER_MAX_DEPTH)
   return segments.length ? segments.join('/') : null
}

export interface MediaItem {
   id?: number
   key: string
   alt: string | null
   folder: string | null
   mime: string | null
   size: number | null
   width: number | null
   height: number | null
   createdAt: string | null
   type: MediaType
   url: string | null
}

export type MediaSourceKind = 'database' | 'filesystem' | 'manifest' | 'none'

export interface MediaSourceInfo {
   kind: MediaSourceKind
   root: string
   builtAt: string | null
}

export interface BlockConfig {
   label: string
   fields: Record<string, FieldConfig>
}

export type ConditionValue = string | number | boolean

export interface FieldCondition {
   field: string
   eq?: ConditionValue
   in?: ConditionValue[]
}

export interface CmsTab {
   id: string
   label: string
}

export interface FieldConfig {
   label: string
   type: FieldType
   tab?: string
   required?: boolean
   private?: boolean
   textarea?: boolean
   integer?: boolean
   translatable?: boolean
   options?: string[]
   multiple?: boolean
   from?: string
   blocks?: Record<string, BlockConfig>
   mediaType?: MediaType | MediaType[]
   accept?: string[]
   to?: string
   cardinality?: 'many-to-one' | 'one-to-one' | 'many-to-many'
   onDelete?: 'set null' | 'cascade' | 'restrict'
   showIf?: FieldCondition | FieldCondition[]
}

export function isPrivateField(field: FieldConfig): boolean {
   return !!field.private
}

export function isRequiredField(field: FieldConfig): boolean {
   return !!field.required && !field.showIf
}

export function fieldConditions(field: FieldConfig): FieldCondition[] {
   if (!field.showIf) return []
   return Array.isArray(field.showIf) ? field.showIf : [field.showIf]
}

function matchesCondition(condition: FieldCondition, value: unknown): boolean {
   if (condition.in) return condition.in.some((option) => option === value)
   return condition.eq === value
}

export function isFieldVisible(
   field: FieldConfig,
   values: Record<string, unknown> | null | undefined
): boolean {
   const conditions = fieldConditions(field)
   if (!conditions.length) return true
   return conditions.every((condition) => matchesCondition(condition, values?.[condition.field]))
}

export function isTranslatableField(field: FieldConfig): boolean {
   return (
      !!field.translatable &&
      (field.type === 'text' || field.type === 'richtext' || field.type === 'media')
   )
}

export function isTranslatableMediaField(field: FieldConfig): boolean {
   return !!field.translatable && field.type === 'media'
}

function parseJsonObject(raw: string): Record<string, string> | null {
   try {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
         return parsed as Record<string, string>
      }
   } catch {
      return null
   }
   return null
}

export function decodeTranslatableValue(
   value: unknown,
   defaultLocale: string
): Record<string, string> | null {
   if (value == null) return null
   if (typeof value === 'object') return value as Record<string, string>
   const raw = String(value).trim()
   if (!raw) return null
   return (raw.startsWith('{') ? parseJsonObject(raw) : null) ?? { [defaultLocale]: raw }
}

export const decodeTranslatableMedia = decodeTranslatableValue

export function encodeTranslatableMedia(value: unknown): string | null {
   if (value == null) return null
   if (typeof value === 'string') return value.trim() || null
   if (typeof value !== 'object') return null
   const entries = Object.entries(value as Record<string, unknown>).filter(
      (pair): pair is [string, string] => typeof pair[1] === 'string' && pair[1].trim() !== ''
   )
   return entries.length ? JSON.stringify(Object.fromEntries(entries)) : null
}

export function pickTranslatedMedia(
   values: Record<string, string> | null | undefined,
   locale: string,
   defaultLocale: string
): string | null {
   if (!values) return null
   return values[locale] || values[defaultLocale] || Object.values(values).find(Boolean) || null
}

export function translatableMediaKeys(entry: EntryLike): string[] {
   return Object.entries(entryFieldsFor(entry))
      .filter(([, field]) => isTranslatableMediaField(field))
      .map(([key]) => key)
}

export function encodeEntryTranslatableMedia(
   entry: EntryLike,
   values: Record<string, unknown>
): Record<string, unknown> {
   const keys = translatableMediaKeys(entry)
   if (!keys.length) return values
   const encoded = { ...values }
   for (const key of keys) {
      if (Object.hasOwn(encoded, key)) encoded[key] = encodeTranslatableMedia(encoded[key])
   }
   return encoded
}

export function decodeEntryTranslatableMedia<T extends Record<string, unknown>>(
   entry: EntryLike,
   rows: T[],
   defaultLocale: string
): T[] {
   const keys = translatableMediaKeys(entry)
   if (!keys.length) return rows
   for (const row of rows) {
      for (const key of keys) {
         if (Object.hasOwn(row, key)) {
            row[key as keyof T] = decodeTranslatableMedia(row[key], defaultLocale) as T[keyof T]
         }
      }
   }
   return rows
}

export function isMultiSelect(field: FieldConfig): boolean {
   return field.type === 'select' && !!field.multiple
}

export function translatableFieldKeys(entry: EntryLike): string[] {
   return Object.entries(entryFieldsFor(entry))
      .filter(([, field]) => isTranslatableField(field))
      .map(([key]) => key)
}

export function translatableBlockFieldKeys(block: BlockConfig): string[] {
   return Object.entries(block.fields)
      .filter(([, field]) => isTranslatableField(field))
      .map(([key]) => key)
}

export function hasTranslatableBlockFields(field: FieldConfig): boolean {
   if (field.type !== 'blocks') return false
   return Object.values(field.blocks ?? {}).some((block) =>
      Object.values(block.fields).some(isTranslatableField)
   )
}

export function localizeBlock(
   field: FieldConfig,
   item: unknown,
   locale: string,
   defaultLocale: string
): unknown {
   if (!item || typeof item !== 'object') return item
   const block = field.blocks?.[String((item as Record<string, unknown>).type)]
   if (!block) return item
   const keys = translatableBlockFieldKeys(block)
   if (!keys.length) return item
   const localized: Record<string, unknown> = { ...(item as Record<string, unknown>) }
   for (const key of keys) {
      const values = decodeTranslatableValue(localized[key], defaultLocale)
      localized[key] = isTranslatableMediaField(block.fields[key]!)
         ? pickTranslatedMedia(values, locale, defaultLocale)
         : values?.[locale] ?? values?.[defaultLocale] ?? null
   }
   return localized
}

export function localizeBlocks(
   field: FieldConfig,
   value: unknown,
   locale: string,
   defaultLocale: string
): unknown {
   if (!Array.isArray(value)) return value
   return value.map((item) => localizeBlock(field, item, locale, defaultLocale))
}

export type CmsEntryKind = 'collection' | 'single' | 'page'

export interface CmsPageRoute {
   path: string
   key: string
   label: string
}

export interface CmsEntry {
   id: string
   label: string
   kind: CmsEntryKind
   titleField?: string
   drafts?: boolean
   fields: Record<string, FieldConfig>
   routes?: 'auto' | string[]
   include?: string[]
   exclude?: string[]
   order?: string[]
   labels?: Record<string, string>
   overrides?: Record<string, Record<string, FieldConfig | null>>
   pages?: CmsPageRoute[]
   tabs?: CmsTab[]
   table?: CmsTable
}

export function entryTabs(entry: Pick<CmsEntry, 'tabs'>): CmsTab[] {
   return entry.tabs?.length ? entry.tabs : []
}

export function fieldTab(field: FieldConfig, tabs: CmsTab[]): string | undefined {
   const fallback = tabs[0]?.id
   if (!fallback) return undefined
   return tabs.some((tab) => tab.id === field.tab) ? field.tab : fallback
}

export function fieldsByTab(
   fields: Record<string, FieldConfig>,
   tabs: CmsTab[]
): Record<string, Record<string, FieldConfig>> {
   const grouped: Record<string, Record<string, FieldConfig>> = {}
   for (const tab of tabs) grouped[tab.id] = {}
   for (const [key, field] of Object.entries(fields)) {
      const id = fieldTab(field, tabs)
      if (!id) continue
      const bucket = grouped[id]
      if (bucket) bucket[key] = field
   }
   return grouped
}

export type CmsConfig = Record<string, CmsEntry>

export const PAGE_PATH_FIELD = 'path'

export function isPageEntry(entry: CmsEntry): boolean {
   return entry.kind === 'page'
}

export function pageSegments(path: string): string[] {
   return path.split('/').filter(Boolean)
}

export function pageKeyFromPath(path: string): string {
   const words = pageSegments(path).flatMap((segment) => segment.split('-'))
   if (!words.length) return 'home'
   return words
      .map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
      .join('')
}

export function pageLabelFromPath(path: string): string {
   const last = pageSegments(path).pop()
   if (!last) return 'Home'
   return last
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
}

export function pageParentPath(path: string): string | undefined {
   const segments = pageSegments(path)
   if (segments.length < 2) return undefined
   return `/${segments.slice(0, -1).join('/')}`
}

export function pageRoutes(entry: CmsEntry): CmsPageRoute[] {
   return entry.pages ?? []
}

export function pageRouteOf(entry: CmsEntry, key: string): CmsPageRoute | undefined {
   return pageRoutes(entry).find((route) => route.key === key)
}

export function pageOverrideFields(
   entry: CmsEntry,
   path: string
): Record<string, FieldConfig | null> {
   return entry.overrides?.[path] ?? {}
}

export function pageFields(entry: CmsEntry, path: string): Record<string, FieldConfig> {
   const fields: Record<string, FieldConfig> = { ...entry.fields }
   for (const [key, field] of Object.entries(pageOverrideFields(entry, path))) {
      if (field) fields[key] = field
      else delete fields[key]
   }
   return fields
}

export function pageAllFields(entry: CmsEntry): Record<string, FieldConfig> {
   const fields: Record<string, FieldConfig> = { ...entry.fields }
   for (const override of Object.values(entry.overrides ?? {})) {
      for (const [key, field] of Object.entries(override)) {
         if (field && !fields[key]) fields[key] = field
      }
   }
   return fields
}

type EntryLike = Pick<CmsEntry, 'fields'> & Partial<Pick<CmsEntry, 'kind' | 'overrides'>>

export function entryFieldsFor(entry: EntryLike, path?: string): Record<string, FieldConfig> {
   if (entry.kind !== 'page') return entry.fields
   return path ? pageFields(entry as CmsEntry, path) : pageAllFields(entry as CmsEntry)
}

export function typeName(name: string) {
   return name.replace(/(?:^|_)([a-z0-9])/gi, (_, c: string) => c.toUpperCase())
}

export function blocksFieldTypeName(entryName: string, fieldKey: string) {
   return `${typeName(entryName)}${typeName(fieldKey)}Block`
}

export function blockTypeName(entryName: string, fieldKey: string, blockName: string) {
   return `${typeName(entryName)}${typeName(fieldKey)}${typeName(blockName)}`
}

interface FieldInputBase {
   label: string
   required?: boolean
   private?: boolean
   tab?: string
   showIf?: FieldCondition | FieldCondition[]
}

export interface TextFieldInput extends FieldInputBase {
   type: 'text'
   textarea?: boolean
   translatable?: boolean
}

export interface RichtextFieldInput extends FieldInputBase {
   type: 'richtext'
   translatable?: boolean
}

export interface NumberFieldInput extends FieldInputBase {
   type: 'number'
   integer?: boolean
}

export interface BooleanFieldInput extends FieldInputBase {
   type: 'boolean'
}

export interface DateFieldInput extends FieldInputBase {
   type: 'date'
}

export interface EmailFieldInput extends FieldInputBase {
   type: 'email'
}

export interface SlugFieldInput extends FieldInputBase {
   type: 'slug'
   from: string
}

export interface SelectFieldInput extends FieldInputBase {
   type: 'select'
   options: string[]
   multiple?: boolean
}

export interface JsonFieldInput extends FieldInputBase {
   type: 'json'
}

export interface MediaFieldInput extends FieldInputBase {
   type: 'media'
   mediaType?: MediaType | MediaType[]
   accept?: string[]
   translatable?: boolean
}

export interface RelationFieldInput extends FieldInputBase {
   type: 'relation'
   to: string
   cardinality?: 'many-to-one' | 'one-to-one' | 'many-to-many'
   onDelete?: 'set null' | 'cascade' | 'restrict'
}

type BlockField<T> = Omit<T, 'private' | 'showIf' | 'tab'>

export type BlockFieldInput =
   | BlockField<TextFieldInput>
   | BlockField<RichtextFieldInput>
   | BlockField<NumberFieldInput>
   | BlockField<BooleanFieldInput>
   | BlockField<DateFieldInput>
   | BlockField<EmailFieldInput>
   | BlockField<SelectFieldInput>
   | BlockField<JsonFieldInput>
   | BlockField<MediaFieldInput>

export interface BlockInput {
   label: string
   fields: Record<string, BlockFieldInput>
}

export interface BlocksFieldInput extends FieldInputBase {
   type: 'blocks'
   blocks: Record<string, BlockInput>
}

export type CmsFieldInput =
   | TextFieldInput
   | RichtextFieldInput
   | NumberFieldInput
   | BooleanFieldInput
   | DateFieldInput
   | EmailFieldInput
   | SlugFieldInput
   | SelectFieldInput
   | JsonFieldInput
   | MediaFieldInput
   | RelationFieldInput
   | BlocksFieldInput

interface CmsEntryInputBase {
   id: string
   label: string
   drafts?: boolean
   tabs?: CmsTab[]
   fields: Record<string, CmsFieldInput>
}

export interface CmsCollectionInput extends CmsEntryInputBase {
   kind: 'collection'
   titleField: string
}

export interface CmsSingleInput extends CmsEntryInputBase {
   kind: 'single'
   titleField?: never
}

export interface CmsPageInput extends CmsEntryInputBase {
   kind: 'page'
   titleField?: never
   drafts?: never
   routes?: 'auto' | string[]
   include?: string[]
   exclude?: string[]
   order?: string[]
   labels?: Record<string, string>
   overrides?: Record<string, Record<string, CmsFieldInput | null>>
}

export type CmsEntryInput = CmsCollectionInput | CmsSingleInput | CmsPageInput

export type CmsConfigInput = Record<string, CmsEntryInput>

export function defineCmsConfig<T extends CmsConfigInput>(config: T): T {
   return config
}
