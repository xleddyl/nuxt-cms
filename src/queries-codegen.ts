import { blockTypeName, typeName } from './runtime/shared/graphql-sdl'
import type { CmsConfig, CmsEntry, FieldConfig } from './runtime/shared/index'
import { entryFieldsFor, isPrivateField, pageFields, pageRoutes } from './runtime/shared/index'

const MEDIA_SELECTION = 'key url type alt folder mime size width height'

function blocksSelection(entryName: string, key: string, field: FieldConfig): string {
   const parts = ['type']
   for (const [blockName, block] of Object.entries(field.blocks ?? {})) {
      const fields = Object.entries(block.fields).map(([blockFieldKey, blockField]) =>
         blockField.type === 'media' ? `${blockFieldKey} { ${MEDIA_SELECTION} }` : blockFieldKey
      )
      if (!fields.length) continue
      parts.push(`... on ${blockTypeName(entryName, key, blockName)} { ${fields.join(' ')} }`)
   }
   return parts.join(' ')
}

function entrySelection(
   config: CmsConfig,
   name: string,
   entry: CmsEntry,
   withRelations: boolean,
   fields: Record<string, FieldConfig> = entryFieldsFor(entry)
): string {
   const parts = ['id']
   if (entry.kind === 'page') parts.push('path')
   for (const [key, field] of Object.entries(fields)) {
      if (isPrivateField(field)) continue
      if (field.type === 'relation') {
         const target = config[field.to!]
         if (!withRelations || !target) continue
         parts.push(`${key} { ${entrySelection(config, field.to!, target, false)} }`)
         continue
      }
      if (field.type === 'media') {
         parts.push(`${key} { ${MEDIA_SELECTION} }`)
         continue
      }
      if (field.type === 'blocks') {
         parts.push(`${key} { ${blocksSelection(name, key, field)} }`)
         continue
      }
      parts.push(key)
   }
   if (entry.kind === 'collection') parts.push('createdAt')
   parts.push('updatedAt')
   return parts.join(' ')
}

export function singleQuery(config: CmsConfig, name: string, entry: CmsEntry): string {
   const selection = entrySelection(config, name, entry, true)
   return `query CmsSingle($locale: String) { ${name}(locale: $locale) { ${selection} } }`
}

export function collectionQuery(config: CmsConfig, name: string, entry: CmsEntry): string {
   const selection = entrySelection(config, name, entry, true)
   const gqlType = typeName(name)
   const args = [
      '$locale: String',
      `$filters: ${gqlType}Filters`,
      `$sort: [${gqlType}Sort!]`,
      '$limit: Int',
      '$offset: Int',
   ].join(', ')
   return `query CmsCollection(${args}) { ${name}(locale: $locale, filters: $filters, sort: $sort, limit: $limit, offset: $offset) { ${selection} } }`
}

export function pageQuery(config: CmsConfig, name: string, entry: CmsEntry, path: string): string {
   const selection = entrySelection(config, name, entry, true, pageFields(entry, path))
   return `query CmsPage($path: String!, $locale: String) { page: ${name}ByPath(path: $path, locale: $locale) { ${selection} } }`
}

export function renderQueriesFile(config: CmsConfig): string {
   const singles: string[] = []
   const collections: string[] = []
   const pages: string[] = []
   for (const [name, entry] of Object.entries(config)) {
      if (entry.kind === 'page') {
         for (const route of pageRoutes(entry)) {
            pages.push(
               `   ${JSON.stringify(route.path)}: ${JSON.stringify(
                  pageQuery(config, name, entry, route.path)
               )},`
            )
         }
         continue
      }
      const line = `   ${JSON.stringify(name)}: ${JSON.stringify(
         entry.kind === 'single'
            ? singleQuery(config, name, entry)
            : collectionQuery(config, name, entry)
      )},`
      if (entry.kind === 'single') singles.push(line)
      else collections.push(line)
   }
   return [
      `export const cmsSingleQueries: Record<string, string> = {`,
      ...singles,
      `}`,
      ``,
      `export const cmsCollectionQueries: Record<string, string> = {`,
      ...collections,
      `}`,
      ``,
      `export const cmsPageQueries: Record<string, string> = {`,
      ...pages,
      `}`,
      ``,
   ].join('\n')
}
