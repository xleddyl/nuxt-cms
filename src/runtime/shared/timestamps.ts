export const SQLITE_ISO_FORMAT = '%Y-%m-%dT%H:%M:%fZ'

export function nowTimestamp(): string {
   return new Date().toISOString()
}

const TIMESTAMP_PATTERN =
   /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/

export function normalizeTimestamp<T>(value: T): T | string {
   if (value instanceof Date) return Number.isNaN(value.getTime()) ? value : value.toISOString()
   if (typeof value !== 'string') return value
   const match = TIMESTAMP_PATTERN.exec(value.trim())
   if (!match) return value
   const [, date, time, fraction = '', zone] = match
   const millis = fraction.padEnd(3, '0').slice(0, 3)
   const utc = `${date}T${time}.${millis}Z`
   if (!zone || zone === 'Z') return utc
   const offset =
      zone.length === 3
         ? `${zone}:00`
         : zone.includes(':')
           ? zone
           : `${zone.slice(0, 3)}:${zone.slice(3)}`
   const parsed = new Date(`${date}T${time}.${millis}${offset}`)
   return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

export function normalizeTimestampFields<T extends Record<string, unknown>>(
   row: T,
   keys: readonly string[] = ['createdAt', 'updatedAt']
): T {
   for (const key of keys) {
      if (Object.hasOwn(row, key)) row[key as keyof T] = normalizeTimestamp(row[key]) as T[keyof T]
   }
   return row
}
