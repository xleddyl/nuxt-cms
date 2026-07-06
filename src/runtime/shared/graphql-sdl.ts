import type { CmsConfig, CmsEntry, FieldConfig } from './index'
import { isTranslatableField } from './index'

export function typeName(name: string) {
   return name.replace(/(?:^|_)([a-z0-9])/gi, (_, c: string) => c.toUpperCase())
}

export function blockUnionName(entryName: string, fieldKey: string) {
   return `${typeName(entryName)}${typeName(fieldKey)}Block`
}

export function blockTypeName(entryName: string, fieldKey: string, blockName: string) {
   return `${typeName(entryName)}${typeName(fieldKey)}${typeName(blockName)}`
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
   if (isTranslatableField(field)) return null
   switch (field.type) {
      case 'json':
         return null
      case 'blocks':
         return null
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
      const nonNull = field.required && !config[field.to!]?.drafts
      return `  ${key}: ${target}${nonNull ? '!' : ''}`
   }
   if (field.type === 'media') return `  ${key}: CmsMedia`
   if (field.type === 'blocks')
      return `  ${key}: [${blockUnionName(entryName, key)}!]${field.required ? '!' : ''}`
   return `  ${key}: ${scalarFor(field)}${field.required ? '!' : ''}`
}

function entrySdl(config: CmsConfig, name: string, entry: CmsEntry): string {
   const lines = ['  id: ID!']
   for (const [key, field] of Object.entries(entry.fields)) {
      lines.push(fieldSdl(config, name, key, field))
   }
   if (entry.kind === 'collection') lines.push('  createdAt: String!')
   lines.push('  updatedAt: String!')
   return `type ${typeName(name)} {\n${lines.join('\n')}\n}`
}

function blocksSdl(name: string, key: string, field: FieldConfig): string[] {
   const defs: string[] = []
   const members: string[] = []
   for (const [blockName, block] of Object.entries(field.blocks ?? {})) {
      const gqlType = blockTypeName(name, key, blockName)
      members.push(gqlType)
      const lines = ['  type: String!']
      for (const [blockFieldKey, blockField] of Object.entries(block.fields)) {
         if (blockField.type === 'media') {
            lines.push(`  ${blockFieldKey}: CmsMedia`)
            continue
         }
         lines.push(`  ${blockFieldKey}: ${scalarFor(blockField)}${blockField.required ? '!' : ''}`)
      }
      defs.push(`type ${gqlType} {\n${lines.join('\n')}\n}`)
   }
   if (members.length) defs.push(`union ${blockUnionName(name, key)} = ${members.join(' | ')}`)
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
   'type CmsMedia {\n  key: String!\n  url: String\n  type: String!\n  alt: String\n  folder: String\n  mime: String\n  size: Int\n  width: Int\n  height: Int\n}',
]

export function renderGraphqlSdl(config: CmsConfig): string {
   const queryLines: string[] = []
   const types: string[] = []

   for (const [name, entry] of Object.entries(config)) {
      const gqlType = typeName(name)
      types.push(entrySdl(config, name, entry))
      for (const [key, field] of Object.entries(entry.fields)) {
         if (field.type === 'blocks') types.push(...blocksSdl(name, key, field))
      }

      if (entry.kind === 'single') {
         queryLines.push(`  ${name}(locale: String): ${gqlType}`)
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
