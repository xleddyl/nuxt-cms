import type { CmsConfig, CmsEntry, FieldConfig } from './index'
import {
   PAGE_PATH_FIELD,
   blockTypeName,
   blocksFieldTypeName,
   isPrivateField,
   isRequiredField,
   isTranslatableField,
   pageAllFields,
   typeName,
} from './index'

export { blockTypeName, blocksFieldTypeName, typeName }

function entryFields(entry: CmsEntry): Record<string, FieldConfig> {
   return entry.kind === 'page' ? pageAllFields(entry) : entry.fields
}

function scalarFor(field: FieldConfig): string {
   switch (field.type) {
      case 'number':
         return field.integer ? 'Int' : 'Float'
      case 'boolean':
         return 'Boolean'
      case 'json':
         return 'JSON'
      default:
         return 'String'
   }
}

function filterScalarFor(field: FieldConfig): string | null {
   if (isPrivateField(field) || isTranslatableField(field)) return null
   switch (field.type) {
      case 'json':
         return null
      case 'blocks':
         return null
      case 'select':
         return field.multiple ? null : 'StringFilter'
      case 'relation':
         return field.cardinality === 'many-to-many' ? null : 'StringFilter'
      case 'number':
         return field.integer ? 'IntFilter' : 'FloatFilter'
      case 'boolean':
         return 'BooleanFilter'
      default:
         return 'StringFilter'
   }
}

function filterableKeys(entry: CmsEntry): [string, string][] {
   const keys: [string, string][] = [['id', 'StringFilter']]
   for (const [key, field] of Object.entries(entry.fields)) {
      const scalar = filterScalarFor(field)
      if (scalar) keys.push([key, scalar])
   }
   keys.push(['createdAt', 'StringFilter'], ['updatedAt', 'StringFilter'])
   return keys
}

function fieldSdl(config: CmsConfig, entryName: string, key: string, field: FieldConfig): string {
   if (field.type === 'relation') {
      const target = typeName(field.to!)
      if (field.cardinality === 'many-to-many') return `  ${key}: [${target}!]!`
      const nonNull = isRequiredField(field) && !config[field.to!]?.drafts
      return `  ${key}: ${target}${nonNull ? '!' : ''}`
   }
   if (field.type === 'media') return `  ${key}: CmsMedia`
   if (field.type === 'select' && field.multiple) return `  ${key}: [String!]!`
   if (field.type === 'blocks')
      return `  ${key}: [${blocksFieldTypeName(entryName, key)}!]${
         isRequiredField(field) ? '!' : ''
      }`
   return `  ${key}: ${scalarFor(field)}${isRequiredField(field) ? '!' : ''}`
}

function entrySdl(config: CmsConfig, name: string, entry: CmsEntry): string {
   const lines = ['  id: ID!']
   if (entry.kind === 'page') lines.push(`  ${PAGE_PATH_FIELD}: String!`)
   for (const [key, field] of Object.entries(entryFields(entry))) {
      if (isPrivateField(field)) continue
      lines.push(fieldSdl(config, name, key, field))
   }
   if (entry.kind === 'collection') lines.push('  createdAt: String!')
   lines.push('  updatedAt: String!')
   return `type ${typeName(name)} {\n${lines.join('\n')}\n}`
}

function blockFieldSdl(field: FieldConfig): { base: string; nonNull: boolean } {
   if (field.type === 'media') return { base: 'CmsMedia', nonNull: false }
   return { base: scalarFor(field), nonNull: !!field.required }
}

function sharedBlockFieldsSdl(field: FieldConfig): string[] {
   const blocks = Object.values(field.blocks ?? {})
   const first = blocks[0]
   if (!first) return []
   const lines: string[] = []
   for (const key of Object.keys(first.fields)) {
      const rendered = blocks.map((block) => block.fields[key])
      if (rendered.some((blockField) => !blockField)) continue
      const types = rendered.map((blockField) => blockFieldSdl(blockField!))
      if (types.some((type) => type.base !== types[0]!.base)) continue
      const nonNull = types.every((type) => type.nonNull)
      lines.push(`  ${key}: ${types[0]!.base}${nonNull ? '!' : ''}`)
   }
   return lines
}

function blocksSdl(name: string, key: string, field: FieldConfig): string[] {
   const blocks = Object.entries(field.blocks ?? {})
   if (!blocks.length) return []
   const interfaceName = blocksFieldTypeName(name, key)
   const shared = ['  type: String!', ...sharedBlockFieldsSdl(field)]
   const defs = [`interface ${interfaceName} {\n${shared.join('\n')}\n}`]
   for (const [blockName, block] of blocks) {
      const lines = ['  type: String!']
      for (const [blockFieldKey, blockField] of Object.entries(block.fields)) {
         const type = blockFieldSdl(blockField)
         lines.push(`  ${blockFieldKey}: ${type.base}${type.nonNull ? '!' : ''}`)
      }
      const gqlType = blockTypeName(name, key, blockName)
      defs.push(`type ${gqlType} implements ${interfaceName} {\n${lines.join('\n')}\n}`)
   }
   return defs
}

function filterSdl(name: string, entry: CmsEntry): string {
   const gqlType = typeName(name)
   const keys = filterableKeys(entry)
   const filters = keys.map(([key, scalar]) => `  ${key}: ${scalar}`).join('\n')
   const sortFields = keys.map(([key]) => `  ${key}`).join('\n')
   return [
      `input ${gqlType}Filters {\n${filters}\n}`,
      `enum ${gqlType}SortField {\n${sortFields}\n}`,
      `input ${gqlType}Sort {\n  field: ${gqlType}SortField!\n  direction: SortDirection = asc\n}`,
   ].join('\n\n')
}

const COMMON_SDL = [
   'scalar JSON',
   'enum SortDirection {\n  asc\n  desc\n}',
   'input IntFilter {\n  eq: Int\n  neq: Int\n  gt: Int\n  gte: Int\n  lt: Int\n  lte: Int\n  in: [Int!]\n  isNull: Boolean\n}',
   'input FloatFilter {\n  eq: Float\n  neq: Float\n  gt: Float\n  gte: Float\n  lt: Float\n  lte: Float\n  in: [Float!]\n  isNull: Boolean\n}',
   'input StringFilter {\n  eq: String\n  neq: String\n  gt: String\n  gte: String\n  lt: String\n  lte: String\n  like: String\n  in: [String!]\n  isNull: Boolean\n}',
   'input BooleanFilter {\n  eq: Boolean\n  neq: Boolean\n  isNull: Boolean\n}',
   'enum CmsMediaType {\n  image\n  video\n  file\n}',
   'type CmsMedia {\n  key: String!\n  url: String\n  type: CmsMediaType!\n  alt: String\n  folder: String\n  mime: String\n  size: Int\n  width: Int\n  height: Int\n}',
]

export function renderGraphqlSdl(config: CmsConfig): string {
   const queryLines: string[] = []
   const types: string[] = []

   for (const [name, entry] of Object.entries(config)) {
      const gqlType = typeName(name)
      types.push(entrySdl(config, name, entry))
      for (const [key, field] of Object.entries(entryFields(entry))) {
         if (field.type === 'blocks' && !isPrivateField(field))
            types.push(...blocksSdl(name, key, field))
      }

      if (entry.kind === 'single') {
         queryLines.push(`  ${name}(locale: String): ${gqlType}`)
         continue
      }

      if (entry.kind === 'page') {
         queryLines.push(`  ${name}(locale: String): [${gqlType}!]!`)
         queryLines.push(`  ${name}ByPath(path: String!, locale: String): ${gqlType}`)
         continue
      }

      types.push(filterSdl(name, entry))
      queryLines.push(
         `  ${name}(filters: ${gqlType}Filters, sort: [${gqlType}Sort!], limit: Int, offset: Int, locale: String): [${gqlType}!]!`
      )
      queryLines.push(`  ${name}ById(id: ID!, locale: String): ${gqlType}`)
      queryLines.push(`  ${name}Count(filters: ${gqlType}Filters): Int!`)
   }

   return [
      ...COMMON_SDL,
      ...types,
      `type Query {\n${queryLines.length ? queryLines.join('\n') : '  _empty: Boolean'}\n}`,
   ].join('\n\n')
}
