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
   return type === 'image' ? 'i-lucide-image' : type === 'video' ? 'i-lucide-film' : 'i-lucide-file'
}

export function mediaPublicUrl(baseUrl: string | null | undefined, key: string): string | null {
   return baseUrl ? `${baseUrl.replace(/\/+$/, '')}/${key}` : null
}

export function slugify(value: string): string {
   return value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036F]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
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
   from?: string
   blocks?: Record<string, BlockConfig>
   mediaType?: MediaType
   accept?: string[]
   to?: string
   cardinality?: 'many-to-one' | 'one-to-one' | 'many-to-many'
   onDelete?: 'set null' | 'cascade' | 'restrict'
}

export function isTranslatableField(field: FieldConfig): boolean {
   return !!field.translatable && (field.type === 'text' || field.type === 'richtext')
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
}

export interface JsonFieldInput extends FieldInputBase {
   type: 'json'
}

export interface MediaFieldInput extends FieldInputBase {
   type: 'media'
   mediaType?: MediaType
   accept?: string[]
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
   | MediaFieldInput

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

export interface CmsEntryInput {
   id: string
   label: string
   kind: 'collection' | 'single'
   titleField?: string
   drafts?: boolean
   fields: Record<string, CmsFieldInput>
}

export type CmsConfigInput = Record<string, CmsEntryInput>

export function defineCmsConfig<T extends CmsConfigInput>(config: T): T {
   return config
}
