import { blockTypeName, blocksFieldTypeName, typeName } from './runtime/shared/graphql-sdl'
import type { CmsConfig, CmsEntry, FieldConfig } from './runtime/shared/index'
import {
   entryFieldsFor,
   isPrivateField,
   isRequiredField,
   isTranslatableField,
   mediaTypeFilter,
   pageFields,
   pageRoutes,
} from './runtime/shared/index'

function mediaTsType(field: FieldConfig): string {
   const types = mediaTypeFilter(field.mediaType)
   return types ? `CmsMedia<${types.map((type) => `'${type}'`).join(' | ')}>` : 'CmsMedia'
}

function scalarTsType(field: FieldConfig): string {
   switch (field.type) {
      case 'number':
         return 'number'
      case 'boolean':
         return 'boolean'
      case 'json':
         return 'unknown'
      case 'select':
         return field.options!.map((o) => JSON.stringify(o)).join(' | ')
      default:
         return 'string'
   }
}

function fieldTsType(
   config: CmsConfig,
   entryName: string,
   key: string,
   field: FieldConfig
): string {
   if (field.type === 'relation') {
      const target = typeName(field.to!)
      if (field.cardinality === 'many-to-many') return `${target}[]`
      return isRequiredField(field) && !config[field.to!]?.drafts ? target : `${target} | null`
   }
   if (field.type === 'media') return `${mediaTsType(field)} | null`
   if (field.type === 'select' && field.multiple) {
      const union = field.options!.map((o) => JSON.stringify(o)).join(' | ')
      return `(${union})[]`
   }
   if (field.type === 'blocks') {
      const union = blocksFieldTypeName(entryName, key)
      return isRequiredField(field) ? `${union}[]` : `${union}[] | null`
   }
   if (isTranslatableField(field)) return isRequiredField(field) ? 'string' : 'string | null'
   const base = scalarTsType(field)
   return isRequiredField(field) ? base : `${base} | null`
}

function blockTypesTs(entryName: string, key: string, field: FieldConfig): string[] {
   const defs: string[] = []
   const members: string[] = []
   for (const [blockName, block] of Object.entries(field.blocks ?? {})) {
      const name = blockTypeName(entryName, key, blockName)
      members.push(name)
      const lines = [`  __typename?: '${name}'`, `  type: '${blockName}'`]
      for (const [blockFieldKey, blockField] of Object.entries(block.fields)) {
         if (blockField.type === 'media') {
            lines.push(`  ${blockFieldKey}: ${mediaTsType(blockField)} | null`)
            continue
         }
         const base = scalarTsType(blockField)
         lines.push(`  ${blockFieldKey}: ${blockField.required ? base : `${base} | null`}`)
      }
      defs.push(`export interface ${name} {\n${lines.join('\n')}\n}`)
   }
   if (members.length)
      defs.push(`export type ${blocksFieldTypeName(entryName, key)} = ${members.join(' | ')}`)
   return defs
}

function entryTs(config: CmsConfig, name: string, entry: CmsEntry): string {
   const lines = ['  id: string']
   if (entry.kind === 'page') lines.push('  path: string')
   for (const [key, field] of Object.entries(entryFieldsFor(entry))) {
      if (isPrivateField(field)) continue
      lines.push(`  ${key}: ${fieldTsType(config, name, key, field)}`)
   }
   if (entry.kind === 'collection') lines.push('  createdAt: string')
   lines.push('  updatedAt: string')
   return `export interface ${typeName(name)} {\n${lines.join('\n')}\n}`
}

function relationKeys(entry: CmsEntry): string[] {
   return Object.entries(entryFieldsFor(entry))
      .filter(([, field]) => field.type === 'relation' && !isPrivateField(field))
      .map(([key]) => key)
}

function quotedKeys(keys: string[]): string {
   return keys.map((key) => `'${key}'`).join(' | ')
}

function shallowTypeTs(config: CmsConfig, name: string): string {
   const target = typeName(name)
   const entry = config[name]
   const keys = entry ? relationKeys(entry) : []
   return keys.length ? `Omit<${target}, ${quotedKeys(keys)}>` : target
}

function autoTypeTs(config: CmsConfig, name: string, entry: CmsEntry): string {
   const auto = `${typeName(name)}Auto`
   const keys = relationKeys(entry)
   if (!keys.length) return `export type ${auto} = ${typeName(name)}`
   const lines = keys.map((key) => {
      const field = entry.fields[key]!
      const shallow = shallowTypeTs(config, field.to!)
      if (field.cardinality === 'many-to-many') return `  ${key}: ${shallow}[]`
      const nonNull = isRequiredField(field) && !config[field.to!]?.drafts
      return `  ${key}: ${shallow}${nonNull ? '' : ' | null'}`
   })
   return `export type ${auto} = Omit<${typeName(name)}, ${quotedKeys(keys)}> & {\n${lines.join(
      '\n'
   )}\n}`
}

function pageTypesTs(name: string, entry: CmsEntry): string[] {
   const auto = `${typeName(name)}Auto`
   const lines = pageRoutes(entry).map((route) => {
      const keys = ['id', 'path', 'updatedAt', ...Object.keys(pageFields(entry, route.path))]
      return `  ${JSON.stringify(route.path)}: Pick<${auto}, ${quotedKeys(keys)}>`
   })
   return [
      `export interface CmsPageTypes {\n${lines.join('\n')}\n}`,
      `export type CmsPagePath = keyof CmsPageTypes`,
   ]
}

function entryMapsTs(config: CmsConfig): string[] {
   const singles: string[] = []
   const collections: string[] = []
   const pages: string[] = []
   for (const [name, entry] of Object.entries(config)) {
      const line = `  ${JSON.stringify(name)}: ${typeName(name)}Auto`
      if (entry.kind === 'single') singles.push(line)
      else if (entry.kind === 'page') pages.push(...pageTypesTs(name, entry))
      else collections.push(line)
   }
   if (!pages.length) {
      pages.push(
         `export interface CmsPageTypes {\n  [path: string]: never\n}`,
         `export type CmsPagePath = keyof CmsPageTypes`
      )
   }
   return [
      `export interface CmsSingleTypes {\n${singles.join('\n')}\n}`,
      `export interface CmsCollectionTypes {\n${collections.join('\n')}\n}`,
      `export type CmsSingleName = keyof CmsSingleTypes`,
      `export type CmsCollectionName = keyof CmsCollectionTypes`,
      ...pages,
   ]
}

export function renderTypesFile(config: CmsConfig): string {
   const parts = [
      `export type CmsMediaType = 'image' | 'video' | 'file'`,
      `export interface CmsMedia<T extends CmsMediaType = CmsMediaType> {
  key: string
  url: string | null
  type: T
  alt: string | null
  folder: string | null
  mime: string | null
  size: number | null
  width: number | null
  height: number | null
}`,
   ]
   for (const [name, entry] of Object.entries(config)) {
      for (const [key, field] of Object.entries(entryFieldsFor(entry))) {
         if (field.type === 'blocks' && !isPrivateField(field))
            parts.push(...blockTypesTs(name, key, field))
      }
      parts.push(entryTs(config, name, entry))
   }
   for (const [name, entry] of Object.entries(config)) parts.push(autoTypeTs(config, name, entry))
   parts.push(...entryMapsTs(config))
   return `${parts.join('\n\n')}\n`
}
