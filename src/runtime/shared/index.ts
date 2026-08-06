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

export function normalizeMediaFolder(value: string | null | undefined): string | null {
   if (!value) return null
   const segments = value.split('/').map(slugify).filter(Boolean).slice(0, MEDIA_FOLDER_MAX_DEPTH)
   return segments.length ? segments.join('/') : null
}

export interface MediaItem {
   id: number
   key: string
   alt: string | null
   folder: string | null
   mime: string | null
   size: number | null
   width: number | null
   height: number | null
   createdAt: string
   type: MediaType
   url: string | null
}

export interface BlockConfig {
   label: string
   fields: Record<string, FieldConfig>
}

export interface FieldConfig {
   label: string
   type: FieldType
   required?: boolean
   textarea?: boolean
   integer?: boolean
   translatable?: boolean
   options?: string[]
   multiple?: boolean
   from?: string
   blocks?: Record<string, BlockConfig>
   mediaType?: MediaType
   accept?: string[]
   to?: string
   cardinality?: 'many-to-one' | 'one-to-one' | 'many-to-many'
   onDelete?: 'set null' | 'cascade' | 'restrict'
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

export function decodeTranslatableMedia(
   value: unknown,
   defaultLocale: string
): Record<string, string> | null {
   if (value == null) return null
   if (typeof value === 'object') return value as Record<string, string>
   const raw = String(value).trim()
   if (!raw) return null
   return (raw.startsWith('{') ? parseJsonObject(raw) : null) ?? { [defaultLocale]: raw }
}

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

export function translatableMediaKeys(entry: Pick<CmsEntry, 'fields'>): string[] {
   return Object.entries(entry.fields)
      .filter(([, field]) => isTranslatableMediaField(field))
      .map(([key]) => key)
}

export function encodeEntryTranslatableMedia(
   entry: Pick<CmsEntry, 'fields'>,
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
   entry: Pick<CmsEntry, 'fields'>,
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

export function translatableFieldKeys(entry: CmsEntry): string[] {
   return Object.entries(entry.fields)
      .filter(([, field]) => isTranslatableField(field))
      .map(([key]) => key)
}

export interface CmsEntry {
   id: string
   label: string
   kind: 'collection' | 'single'
   titleField?: string
   drafts?: boolean
   fields: Record<string, FieldConfig>
   table?: CmsTable
}

export type CmsConfig = Record<string, CmsEntry>

interface FieldInputBase {
   label: string
   required?: boolean
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
   mediaType?: MediaType
   accept?: string[]
   translatable?: boolean
}

export interface RelationFieldInput extends FieldInputBase {
   type: 'relation'
   to: string
   cardinality?: 'many-to-one' | 'one-to-one' | 'many-to-many'
   onDelete?: 'set null' | 'cascade' | 'restrict'
}

export type BlockFieldInput =
   | Omit<TextFieldInput, 'translatable'>
   | Omit<RichtextFieldInput, 'translatable'>
   | NumberFieldInput
   | BooleanFieldInput
   | DateFieldInput
   | EmailFieldInput
   | SelectFieldInput
   | JsonFieldInput
   | Omit<MediaFieldInput, 'translatable'>

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

export type CmsEntryInput = CmsCollectionInput | CmsSingleInput

export type CmsConfigInput = Record<string, CmsEntryInput>

export function defineCmsConfig<T extends CmsConfigInput>(config: T): T {
   return config
}
