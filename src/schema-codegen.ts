import { typeName } from './runtime/shared/graphql-sdl'
import type { CmsConfig, CmsEntry, CmsI18n, FieldConfig } from './runtime/shared/index'
import { isTranslatableField } from './runtime/shared/index'

export type Dialect = 'sqlite' | 'postgres'
export type Driver = Dialect | 'libsql'

const IDENTIFIER = /^[a-z_]\w*$/i
const RESERVED_ENTRY_KEYS = ['admin', 'auth', 'login', 'media', 'graphql', 'cms_media']
const RESERVED_COLUMNS = ['id', 'status', 'created_at', 'updated_at']
const RESERVED_TYPE_NAMES = [
   'Query',
   'Mutation',
   'Subscription',
   'CmsMedia',
   'JSON',
   'SortDirection',
   'IntFilter',
   'FloatFilter',
   'StringFilter',
   'BooleanFilter',
]

export function validateConfig(config: CmsConfig, i18n?: CmsI18n): string[] {
   const errors: string[] = []

   const locales = i18n?.locales ?? []
   if (locales.length && !locales.includes(i18n!.defaultLocale)) {
      errors.push(
         `cms.i18n: defaultLocale '${i18n!.defaultLocale}' is not in locales [${locales.join(
            ', '
         )}]`
      )
   }

   const entryIds = new Map<string, string>()
   const typeNames = new Map<string, string>()
   for (const [name, entry] of Object.entries(config)) {
      const at = `cms.config entry '${name}'`
      if (!IDENTIFIER.test(name)) errors.push(`${at}: key must be a valid identifier`)
      if (RESERVED_ENTRY_KEYS.includes(name)) errors.push(`${at}: '${name}' is a reserved name`)
      const gqlType = typeName(name)
      if (RESERVED_TYPE_NAMES.includes(gqlType)) {
         errors.push(`${at}: GraphQL type name '${gqlType}' is reserved`)
      } else if (typeNames.has(gqlType)) {
         errors.push(
            `${at}: GraphQL type name '${gqlType}' clashes with entry '${typeNames.get(gqlType)}'`
         )
      } else {
         typeNames.set(gqlType, name)
      }
      if (!entry.id) {
         errors.push(`${at}: id is required`)
      } else if (!IDENTIFIER.test(entry.id)) {
         errors.push(`${at}: id '${entry.id}' must be a valid identifier`)
      } else if (entryIds.has(entry.id)) {
         errors.push(`${at}: id '${entry.id}' is already used by entry '${entryIds.get(entry.id)}'`)
      } else {
         entryIds.set(entry.id, name)
      }
      if (entry.kind !== 'collection' && entry.kind !== 'single')
         errors.push(`${at}: kind must be 'collection' or 'single'`)
      if (entry.drafts && entry.kind !== 'collection')
         errors.push(`${at}: drafts are only supported on collections`)
      if (!entry.fields || !Object.keys(entry.fields).length)
         errors.push(`${at}: fields must not be empty`)
      if (entry.titleField && !entry.fields?.[entry.titleField])
         errors.push(`${at}: titleField '${entry.titleField}' is not a declared field`)

      const columnNames = new Set<string>()
      for (const [key, field] of Object.entries(entry.fields ?? {})) {
         const fat = `${at}, field '${key}'`
         if (!IDENTIFIER.test(key)) errors.push(`${fat}: key must be a valid identifier`)
         const column = snakeCase(key)
         if (RESERVED_COLUMNS.includes(column))
            errors.push(`${fat}: column '${column}' is reserved`)
         if (!isManyToMany(field)) {
            if (columnNames.has(column))
               errors.push(`${fat}: column '${column}' clashes with another field`)
            columnNames.add(column)
         }
         if (field.translatable) {
            if (field.type !== 'text' && field.type !== 'richtext')
               errors.push(`${fat}: translatable is only supported on text and richtext fields`)
            if (!locales.length)
               errors.push(`${fat}: translatable requires cms.i18n.locales in nuxt.config`)
         }
         if (field.type === 'select') {
            if (!field.options?.length)
               errors.push(`${fat}: select requires a non-empty options array`)
            else if (new Set(field.options).size !== field.options.length)
               errors.push(`${fat}: select options must be unique`)
         }
         if (field.type === 'slug' && field.from) {
            const source = entry.fields?.[field.from]
            if (!source) errors.push(`${fat}: slug source '${field.from}' is not a declared field`)
            else if (source.type !== 'text')
               errors.push(`${fat}: slug source '${field.from}' must be a text field`)
            else if (isTranslatableField(source))
               errors.push(`${fat}: slug source '${field.from}' cannot be translatable`)
         }
         if (field.type === 'blocks') {
            if (field.translatable) errors.push(`${fat}: blocks fields cannot be translatable`)
            if (!field.blocks || !Object.keys(field.blocks).length) {
               errors.push(`${fat}: blocks requires a non-empty blocks map`)
            }
            for (const [blockName, block] of Object.entries(field.blocks ?? {})) {
               const bat = `${fat}, block '${blockName}'`
               if (!IDENTIFIER.test(blockName))
                  errors.push(`${bat}: key must be a valid identifier`)
               if (!block.fields || !Object.keys(block.fields).length)
                  errors.push(`${bat}: fields must not be empty`)
               for (const [blockFieldKey, blockField] of Object.entries(block.fields ?? {})) {
                  const bfat = `${bat}, field '${blockFieldKey}'`
                  if (!IDENTIFIER.test(blockFieldKey))
                     errors.push(`${bfat}: key must be a valid identifier`)
                  if (blockFieldKey === 'type')
                     errors.push(`${bfat}: 'type' is reserved inside blocks`)
                  if (['relation', 'blocks', 'slug'].includes(blockField.type)) {
                     errors.push(
                        `${bfat}: ${blockField.type} fields are not supported inside blocks`
                     )
                  }
                  if (blockField.translatable)
                     errors.push(`${bfat}: translatable fields are not supported inside blocks`)
                  if (blockField.type === 'select' && !blockField.options?.length) {
                     errors.push(`${bfat}: select requires a non-empty options array`)
                  }
               }
            }
         }
         if (field.type === 'relation') {
            const target = field.to ? config[field.to] : undefined
            if (!field.to || !target) {
               errors.push(`${fat}: relation target '${field.to}' is not in the registry`)
            } else {
               if (target.kind !== 'collection')
                  errors.push(`${fat}: relation target '${field.to}' must be a collection`)
               if (!entry.table && target.table)
                  errors.push(
                     `${fat}: relation target '${field.to}' uses a custom table — derived relations can only target derived entries`
                  )
            }
            if (
               field.cardinality &&
               !['many-to-one', 'one-to-one', 'many-to-many'].includes(field.cardinality)
            ) {
               errors.push(`${fat}: unknown cardinality '${field.cardinality}'`)
            }
            if (field.required && field.onDelete === 'set null')
               errors.push(`${fat}: a required relation cannot use onDelete 'set null'`)
            if (field.cardinality === 'many-to-many') {
               if (field.onDelete === 'set null')
                  errors.push(`${fat}: many-to-many does not accept onDelete 'set null'`)
               if (entry.table)
                  errors.push(`${fat}: many-to-many is not available on custom-table entries`)
               if (config[`${name}_${key}`])
                  errors.push(`${fat}: '${name}_${key}' clashes with the derived join table name`)
            }
         }
      }
   }

   const sqlTableNames = new Map<string, string>([['cms_media', 'the built-in media table']])
   for (const [name, entry] of Object.entries(config)) {
      if (entry.table) continue
      const registerTable = (sqlName: string, source: string) => {
         const existing = sqlTableNames.get(sqlName)
         if (existing) {
            errors.push(
               `cms.config: table name '${sqlName}' from ${source} clashes with ${existing}`
            )
         } else {
            sqlTableNames.set(sqlName, source)
         }
      }
      registerTable(name, `entry '${name}'`)
      for (const [key, field] of Object.entries(entry.fields ?? {})) {
         if (isManyToMany(field))
            registerTable(`${name}_${snakeCase(key)}`, `the join table of '${name}.${key}'`)
      }
   }

   return errors
}

function snakeCase(key: string) {
   return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

function jsonExpr(col: string, dialect: Dialect) {
   return dialect === 'postgres' ? `jsonb('${col}')` : `text('${col}', { mode: 'json' })`
}

function columnExpr(key: string, field: FieldConfig, dialect: Dialect): string {
   const col = snakeCase(key)
   let expr: string
   if (isTranslatableField(field)) {
      expr = jsonExpr(col, dialect)
      if (field.required) expr += '.notNull()'
      return `  ${key}: ${expr},`
   }
   switch (field.type) {
      case 'number':
         expr = field.integer
            ? `integer('${col}')`
            : dialect === 'postgres'
              ? `doublePrecision('${col}')`
              : `real('${col}')`
         break
      case 'boolean':
         expr =
            dialect === 'postgres' ? `boolean('${col}')` : `integer('${col}', { mode: 'boolean' })`
         break
      case 'date':
         expr = dialect === 'postgres' ? `date('${col}', { mode: 'string' })` : `text('${col}')`
         break
      case 'json':
      case 'blocks':
         expr = jsonExpr(col, dialect)
         break
      case 'slug':
         expr = `text('${col}').unique()`
         break
      case 'relation': {
         const onDelete = field.onDelete ?? (field.required ? 'restrict' : 'set null')
         expr = `text('${col}').references(() => ${field.to}.id, { onDelete: '${onDelete}' })`
         if (field.cardinality === 'one-to-one') expr += '.unique()'
         break
      }
      default:
         expr = `text('${col}')`
   }
   if (field.required) expr += '.notNull()'
   return `  ${key}: ${expr},`
}

function isManyToMany(field: FieldConfig) {
   return field.type === 'relation' && field.cardinality === 'many-to-many'
}

function autoIdExpr(pg: boolean) {
   return pg
      ? `integer('id').primaryKey().generatedAlwaysAsIdentity()`
      : `integer('id').primaryKey({ autoIncrement: true })`
}

function nowExpr(pg: boolean, col: string) {
   return pg
      ? `timestamp('${col}', { mode: 'string' }).notNull().defaultNow()`
      : `text('${col}').notNull().default(sql\`(datetime('now'))\`)`
}

function tableExpr(name: string, entry: CmsEntry, dialect: Dialect): string {
   const pg = dialect === 'postgres'
   const tableFn = pg ? 'pgTable' : 'sqliteTable'
   const lines: string[] = []

   lines.push(`  id: text('id').primaryKey(),`)

   for (const [key, field] of Object.entries(entry.fields)) {
      if (isManyToMany(field)) continue
      lines.push(columnExpr(key, field, dialect))
   }

   if (entry.drafts) lines.push(`  status: text('status').notNull().default('draft'),`)

   if (entry.kind === 'collection') lines.push(`  createdAt: ${nowExpr(pg, 'created_at')},`)
   lines.push(`  updatedAt: ${nowExpr(pg, 'updated_at')},`)

   return `export const ${name} = ${tableFn}('${name}', {\n${lines.join('\n')}\n})`
}

function joinTableExpr(name: string, key: string, field: FieldConfig, dialect: Dialect): string {
   const pg = dialect === 'postgres'
   const tableFn = pg ? 'pgTable' : 'sqliteTable'
   const joinName = `${name}_${snakeCase(key)}`
   const targetOnDelete = field.onDelete ?? 'cascade'
   return (
      `export const ${name}_${key} = ${tableFn}('${joinName}', {\n` +
      `  sourceId: text('source_id').notNull().references(() => ${name}.id, { onDelete: 'cascade' }),\n` +
      `  targetId: text('target_id').notNull().references(() => ${field.to}.id, { onDelete: '${targetOnDelete}' }),\n` +
      `  position: integer('position').notNull().default(0),\n` +
      `}, table => [primaryKey({ columns: [table.sourceId, table.targetId] })])`
   )
}

function mediaTableExpr(dialect: Dialect): string {
   const pg = dialect === 'postgres'
   const tableFn = pg ? 'pgTable' : 'sqliteTable'
   return (
      `export const cms_media = ${tableFn}('cms_media', {\n` +
      `  id: ${autoIdExpr(pg)},\n` +
      `  key: text('key').notNull().unique(),\n` +
      `  alt: text('alt'),\n` +
      `  folder: text('folder'),\n` +
      `  mime: text('mime'),\n` +
      `  size: integer('size'),\n` +
      `  width: integer('width'),\n` +
      `  height: integer('height'),\n` +
      `  createdAt: ${nowExpr(pg, 'created_at')},\n` +
      `})`
   )
}

export function renderSchemaFile(
   config: CmsConfig,
   dialect: Dialect,
   resolveImport: (specifier: string) => string = (s) => s
): string {
   const derived = Object.entries(config).filter(([, entry]) => !entry.table)

   const fields = derived.flatMap(([, entry]) => Object.values(entry.fields))
   const pg = dialect === 'postgres'

   const core = new Set(['integer', 'text', pg ? 'pgTable' : 'sqliteTable'])
   if (fields.some((f) => f.type === 'number' && !f.integer))
      core.add(pg ? 'doublePrecision' : 'real')
   if (pg && fields.some((f) => f.type === 'date')) core.add('date')
   if (pg && fields.some((f) => f.type === 'boolean')) core.add('boolean')
   if (pg && fields.some((f) => f.type === 'json' || f.type === 'blocks' || isTranslatableField(f)))
      core.add('jsonb')
   if (pg) core.add('timestamp')
   if (fields.some(isManyToMany)) core.add('primaryKey')

   const imports = [
      ...(pg ? [] : [`import { sql } from '${resolveImport('drizzle-orm')}'`]),
      `import { ${[...core].sort().join(', ')} } from '${resolveImport(
         `drizzle-orm/${pg ? 'pg-core' : 'sqlite-core'}`
      )}'`,
   ]

   const tables = derived.map(([name, entry]) => tableExpr(name, entry, dialect))
   const joins = derived.flatMap(([name, entry]) =>
      Object.entries(entry.fields)
         .filter(([, field]) => isManyToMany(field))
         .map(([key, field]) => joinTableExpr(name, key, field, dialect))
   )

   return `${imports.join('\n')}\n\n${[mediaTableExpr(dialect), ...tables, ...joins].join(
      '\n\n'
   )}\n`
}
