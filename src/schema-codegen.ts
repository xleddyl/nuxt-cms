import { typeName } from './runtime/shared/graphql-sdl'
import type { CmsConfig, CmsEntry, CmsI18n, FieldConfig } from './runtime/shared/index'
import {
   PAGE_PATH_FIELD,
   fieldConditions,
   isMultiSelect,
   isRequiredField,
   isTranslatableField,
   isRowsStorage,
   isTranslatableMediaField,
   pageAllFields,
   pageColumnFields,
   pageFieldsTableName,
   pageMediaTableName,
   pageRoutes,
} from './runtime/shared/index'

export type Dialect = 'sqlite' | 'postgres'
export type Driver = Dialect | 'libsql' | 'd1'

const IDENTIFIER = /^[a-z_]\w*$/i
const RESERVED_ENTRY_KEYS = ['admin', 'auth', 'login', 'media', 'graphql', 'cms_media']
const RESERVED_COLUMNS = ['id', 'status', 'created_at', 'updated_at']
const TITLE_FIELD_TYPES = ['text', 'slug', 'email', 'number', 'date', 'select']
const TRANSLATABLE_FIELD_TYPES = ['text', 'richtext', 'media']
const CONDITION_FIELD_TYPES = ['select', 'boolean', 'text', 'number', 'date', 'email', 'slug']
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

   let pageEntry: string | undefined
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
      if (entry.kind !== 'collection' && entry.kind !== 'single' && entry.kind !== 'page')
         errors.push(`${at}: kind must be 'collection', 'single' or 'page'`)
      if (entry.kind === 'page') {
         if (pageEntry) {
            errors.push(
               `${at}: only one page entry is allowed (already declared as '${pageEntry}')`
            )
         } else {
            pageEntry = name
         }
         if (entry.titleField) errors.push(`${at}: pages have no titleField`)
         if (Object.hasOwn(entry.fields ?? {}, PAGE_PATH_FIELD))
            errors.push(`${at}: '${PAGE_PATH_FIELD}' is a reserved field name on pages`)
         const known = new Set(pageRoutes(entry).map((route) => route.path))
         const keys = new Map<string, string>()
         for (const route of pageRoutes(entry)) {
            const clash = keys.get(route.key)
            if (clash) errors.push(`${at}: paths '${clash}' and '${route.path}' give the same key`)
            else keys.set(route.key, route.path)
         }
         for (const [path, override] of Object.entries(entry.overrides ?? {})) {
            const oat = `${at}, override '${path}'`
            if (known.size && !known.has(path)) errors.push(`${oat}: '${path}' is not a page path`)
            for (const [key, field] of Object.entries(override)) {
               const shared = Object.hasOwn(entry.fields ?? {}, key)
               if (field && shared)
                  errors.push(`${oat}: field '${key}' is already declared for every page`)
               if (!field && !shared)
                  errors.push(
                     `${oat}: field '${key}' is not declared for every page, nothing to remove`
                  )
               if (key === PAGE_PATH_FIELD)
                  errors.push(`${oat}: '${PAGE_PATH_FIELD}' is a reserved field name on pages`)
            }
         }
         const declared = new Map<string, string>()
         for (const override of Object.values(entry.overrides ?? {})) {
            for (const [key, field] of Object.entries(override)) {
               if (!field) continue
               const seen = declared.get(key)
               if (seen && seen !== field.type) {
                  errors.push(
                     `${at}: field '${key}' is declared as '${seen}' and '${field.type}' by different pages`
                  )
               }
               declared.set(key, field.type)
            }
         }
         errors.push(...pageStorageErrors(at, entry))
      } else if (entry.overrides || entry.routes || entry.include || entry.exclude) {
         errors.push(`${at}: routes, include, exclude and overrides need kind 'page'`)
      }
      if (entry.kind !== 'page' && (entry.storage || entry.columns))
         errors.push(`${at}: storage and columns need kind 'page'`)
      if (entry.drafts && entry.kind !== 'collection')
         errors.push(`${at}: drafts are only supported on collections`)
      const tabIds = new Set<string>()
      for (const tab of entry.tabs ?? []) {
         if (!tab.id) errors.push(`${at}: every tab needs an id`)
         else if (tabIds.has(tab.id)) errors.push(`${at}: tab '${tab.id}' is declared twice`)
         else tabIds.add(tab.id)
         if (!tab.label) errors.push(`${at}: tab '${tab.id}' needs a label`)
      }
      const tabbedFields = [
         ...Object.entries(entry.fields ?? {}),
         ...Object.values(entry.overrides ?? {}).flatMap((override) =>
            Object.entries(override).filter(([, field]) => field)
         ),
      ] as [string, FieldConfig][]
      for (const [key, field] of tabbedFields) {
         if (!field.tab) continue
         if (!tabIds.size)
            errors.push(`${at}: field '${key}' has a tab but the entry declares none`)
         else if (!tabIds.has(field.tab))
            errors.push(`${at}: field '${key}' points at the unknown tab '${field.tab}'`)
      }
      if (!entry.fields || !Object.keys(entry.fields).length)
         errors.push(`${at}: fields must not be empty`)
      if (entry.kind === 'collection' && !entry.titleField) {
         errors.push(`${at}: titleField is required on collections`)
      } else if (entry.titleField) {
         const titleField = entry.fields?.[entry.titleField]
         if (!titleField) {
            errors.push(`${at}: titleField '${entry.titleField}' is not a declared field`)
         } else if (!TITLE_FIELD_TYPES.includes(titleField.type) || isMultiSelect(titleField)) {
            errors.push(
               `${at}: titleField '${entry.titleField}' must be one of ${TITLE_FIELD_TYPES.join(
                  ', '
               )} (got '${titleField.type}')`
            )
         }
      }

      const allFields = entry.kind === 'page' ? pageAllFields(entry) : entry.fields ?? {}
      const columnNames = new Set<string>()
      for (const [key, field] of Object.entries(allFields)) {
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
            if (!TRANSLATABLE_FIELD_TYPES.includes(field.type))
               errors.push(
                  `${fat}: translatable is only supported on text, richtext and media fields`
               )
            if (!locales.length)
               errors.push(`${fat}: translatable requires cms.i18n.locales in nuxt.config`)
         }
         if (field.type === 'select') {
            if (!field.options?.length)
               errors.push(`${fat}: select requires a non-empty options array`)
            else if (new Set(field.options).size !== field.options.length)
               errors.push(`${fat}: select options must be unique`)
         }
         if (field.showIf) {
            if (entry.titleField === key)
               errors.push(`${fat}: the titleField cannot be conditional`)
            for (const condition of fieldConditions(field)) {
               const cat = `${fat}, showIf on '${condition.field}'`
               const target = allFields[condition.field]
               if (!condition.field || !target) {
                  errors.push(`${cat}: '${condition.field}' is not a declared field`)
                  continue
               }
               if (condition.field === key) {
                  errors.push(`${cat}: a field cannot depend on itself`)
                  continue
               }
               if (!CONDITION_FIELD_TYPES.includes(target.type) || isMultiSelect(target)) {
                  errors.push(
                     `${cat}: showIf can only depend on ${CONDITION_FIELD_TYPES.join(
                        ', '
                     )} fields (got '${target.type}')`
                  )
                  continue
               }
               if (isTranslatableField(target)) {
                  errors.push(`${cat}: showIf cannot depend on a translatable field`)
                  continue
               }
               const values = condition.in ?? (condition.eq === undefined ? null : [condition.eq])
               if (!values || !values.length) {
                  errors.push(`${cat}: showIf requires 'eq' or a non-empty 'in'`)
                  continue
               }
               if (condition.in && condition.eq !== undefined)
                  errors.push(`${cat}: showIf accepts either 'eq' or 'in', not both`)
               if (target.type === 'select') {
                  const unknown = values.filter((value) => !target.options?.includes(String(value)))
                  if (unknown.length)
                     errors.push(
                        `${cat}: ${unknown
                           .map((value) => `'${String(value)}'`)
                           .join(', ')} not in the options of '${condition.field}'`
                     )
               }
            }
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
                  if (blockField.translatable) {
                     if (!TRANSLATABLE_FIELD_TYPES.includes(blockField.type))
                        errors.push(
                           `${bfat}: translatable is only supported on text, richtext and media fields`
                        )
                     if (!locales.length)
                        errors.push(
                           `${bfat}: translatable requires cms.i18n.locales in nuxt.config`
                        )
                  }
                  if (blockField.private)
                     errors.push(`${bfat}: private fields are not supported inside blocks`)
                  if (blockField.showIf)
                     errors.push(`${bfat}: showIf is not supported inside blocks`)
                  if (blockField.type === 'select' && !blockField.options?.length) {
                     errors.push(`${bfat}: select requires a non-empty options array`)
                  }
                  if (blockField.type === 'select' && blockField.multiple) {
                     errors.push(`${bfat}: multiple select is not supported inside blocks`)
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
      if (isRowsStorage(entry)) {
         registerTable(pageFieldsTableName(name), `the field rows table of '${name}'`)
         registerTable(pageMediaTableName(name), `the media rows table of '${name}'`)
      }
      for (const [key, field] of Object.entries(entry.fields ?? {})) {
         if (isManyToMany(field))
            registerTable(`${name}_${snakeCase(key)}`, `the join table of '${name}.${key}'`)
      }
   }

   return errors
}

function pageStorageErrors(at: string, entry: CmsEntry): string[] {
   const errors: string[] = []
   const storage = entry.storage ?? 'columns'
   if (storage !== 'columns' && storage !== 'rows') {
      errors.push(`${at}: storage must be 'columns' or 'rows'`)
      return errors
   }
   if (storage === 'columns') {
      if (entry.columns) errors.push(`${at}: columns needs storage 'rows'`)
      return errors
   }
   if (entry.table) errors.push(`${at}: storage 'rows' is not available on custom-table entries`)
   const columns = new Set<string>()
   for (const key of entry.columns ?? []) {
      const cat = `${at}, column '${key}'`
      if (columns.has(key)) errors.push(`${cat}: listed more than once`)
      columns.add(key)
      if (!Object.hasOwn(entry.fields ?? {}, key)) {
         errors.push(`${cat}: not a field declared for every page in fields`)
         continue
      }
      for (const [path, override] of Object.entries(entry.overrides ?? {})) {
         if (Object.hasOwn(override, key) && !override[key])
            errors.push(`${cat}: removed from '${path}', a column must exist on every page`)
      }
   }
   for (const [key, field] of Object.entries(pageAllFields(entry))) {
      const fat = `${at}, field '${key}'`
      if (isManyToMany(field)) {
         errors.push(`${fat}: many-to-many relations are not supported with storage 'rows'`)
         continue
      }
      if (columns.has(key)) continue
      if (field.type === 'relation' || field.type === 'slug')
         errors.push(
            `${fat}: ${field.type} fields need to be listed in columns with storage 'rows'`
         )
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
      expr = isTranslatableMediaField(field) ? `text('${col}')` : jsonExpr(col, dialect)
      if (isRequiredField(field)) expr += '.notNull()'
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
      case 'select':
         expr = field.multiple ? jsonExpr(col, dialect) : `text('${col}')`
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
   if (isRequiredField(field)) expr += '.notNull()'
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

   if (entry.kind === 'page') lines.push(`  path: text('path').notNull().unique(),`)

   for (const [key, field] of Object.entries(
      entry.kind === 'page' ? pageColumnFields(entry) : entry.fields
   )) {
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

function pageRowsTableExprs(name: string, dialect: Dialect): string[] {
   const tableFn = dialect === 'postgres' ? 'pgTable' : 'sqliteTable'
   const rowsTable = (table: string, valueLine: string) =>
      `export const ${table} = ${tableFn}('${table}', {\n` +
      `  pageId: text('page_id').notNull().references(() => ${name}.id, { onDelete: 'cascade' }),\n` +
      `  key: text('key').notNull(),\n` +
      `  position: integer('position').notNull().default(0),\n` +
      `  ${valueLine},\n` +
      `}, table => [primaryKey({ columns: [table.pageId, table.key, table.position] })])`
   return [
      rowsTable(pageFieldsTableName(name), `value: text('value').notNull()`),
      rowsTable(pageMediaTableName(name), `mediaKey: text('media_key').notNull()`),
   ]
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

   const fields = derived.flatMap(([, entry]) =>
      Object.values(isRowsStorage(entry) ? pageColumnFields(entry) : entry.fields)
   )
   const rowsEntries = derived.filter(([, entry]) => isRowsStorage(entry))
   const pg = dialect === 'postgres'

   const core = new Set(['integer', 'text', pg ? 'pgTable' : 'sqliteTable'])
   if (fields.some((f) => f.type === 'number' && !f.integer))
      core.add(pg ? 'doublePrecision' : 'real')
   if (pg && fields.some((f) => f.type === 'date')) core.add('date')
   if (pg && fields.some((f) => f.type === 'boolean')) core.add('boolean')
   if (
      pg &&
      fields.some(
         (f) =>
            f.type === 'json' ||
            f.type === 'blocks' ||
            (isTranslatableField(f) && !isTranslatableMediaField(f)) ||
            isMultiSelect(f)
      )
   )
      core.add('jsonb')
   if (pg) core.add('timestamp')
   if (fields.some(isManyToMany) || rowsEntries.length) core.add('primaryKey')

   const imports = [
      ...(pg ? [] : [`import { sql } from '${resolveImport('drizzle-orm')}'`]),
      `import { ${[...core].sort().join(', ')} } from '${resolveImport(
         `drizzle-orm/${pg ? 'pg-core' : 'sqlite-core'}`
      )}'`,
   ]

   const tables = derived.map(([name, entry]) => tableExpr(name, entry, dialect))
   const joins = derived.flatMap(([name, entry]) =>
      Object.entries(entry.kind === 'page' ? pageAllFields(entry) : entry.fields)
         .filter(([, field]) => isManyToMany(field))
         .map(([key, field]) => joinTableExpr(name, key, field, dialect))
   )

   const rows = rowsEntries.flatMap(([name]) => pageRowsTableExprs(name, dialect))

   return `${imports.join('\n')}\n\n${[mediaTableExpr(dialect), ...tables, ...joins, ...rows].join(
      '\n\n'
   )}\n`
}
