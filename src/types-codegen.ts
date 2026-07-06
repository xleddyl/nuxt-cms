import { blockTypeName, blockUnionName, typeName } from './runtime/shared/graphql-sdl'
import type { CmsConfig, CmsEntry, FieldConfig } from './runtime/shared/index'
import { isTranslatableField } from './runtime/shared/index'

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
      return field.required && !config[field.to!]?.drafts ? target : `${target} | null`
   }
   if (field.type === 'media') return 'CmsMedia | null'
   if (field.type === 'blocks') {
      const union = blockUnionName(entryName, key)
      return field.required ? `${union}[]` : `${union}[] | null`
   }
   if (isTranslatableField(field)) return field.required ? 'string' : 'string | null'
   const base = scalarTsType(field)
   return field.required ? base : `${base} | null`
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
            lines.push(`  ${blockFieldKey}: CmsMedia | null`)
            continue
         }
         const base = scalarTsType(blockField)
         lines.push(`  ${blockFieldKey}: ${blockField.required ? base : `${base} | null`}`)
      }
      defs.push(`export interface ${name} {\n${lines.join('\n')}\n}`)
   }
   if (members.length)
      defs.push(`export type ${blockUnionName(entryName, key)} = ${members.join(' | ')}`)
   return defs
}

function entryTs(config: CmsConfig, name: string, entry: CmsEntry): string {
   const lines = ['  id: string']
   for (const [key, field] of Object.entries(entry.fields)) {
      lines.push(`  ${key}: ${fieldTsType(config, name, key, field)}`)
   }
   if (entry.kind === 'collection') lines.push('  createdAt: string')
   lines.push('  updatedAt: string')
   return `export interface ${typeName(name)} {\n${lines.join('\n')}\n}`
}

export function renderTypesFile(config: CmsConfig): string {
   const parts = [
      `export interface CmsMedia {
  key: string
  url: string | null
  type: 'image' | 'video' | 'file'
  alt: string | null
  folder: string | null
  mime: string | null
  size: number | null
  width: number | null
  height: number | null
}`,
   ]
   for (const [name, entry] of Object.entries(config)) {
      for (const [key, field] of Object.entries(entry.fields)) {
         if (field.type === 'blocks') parts.push(...blockTypesTs(name, key, field))
      }
      parts.push(entryTs(config, name, entry))
   }
   return `${parts.join('\n\n')}\n`
}
