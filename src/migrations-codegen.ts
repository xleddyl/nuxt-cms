import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CmsMigration } from './runtime/server/utils/migrate'

interface JournalEntry {
   idx: number
   when: number
   tag: string
   breakpoints: boolean
}

export async function collectMigrations(migrationsDir: string): Promise<CmsMigration[] | null> {
   const journalPath = join(migrationsDir, 'meta', '_journal.json')
   if (!existsSync(journalPath)) return null

   const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
      entries?: JournalEntry[]
   }

   const migrations: CmsMigration[] = []
   for (const entry of journal.entries ?? []) {
      const query = await readFile(join(migrationsDir, `${entry.tag}.sql`), 'utf8')
      migrations.push({
         sql: query.split('--> statement-breakpoint'),
         bps: entry.breakpoints,
         folderMillis: entry.when,
         hash: createHash('sha256').update(query).digest('hex'),
      })
   }
   return migrations
}

export function renderMigrationsFile(migrations: CmsMigration[] | null): string {
   return [
      `export const generated = ${migrations !== null}`,
      ``,
      `export const migrations = ${JSON.stringify(migrations ?? [], null, 3)}`,
      ``,
   ].join('\n')
}

export function renderMigrationsTypes(typesPath: string): string {
   return [
      `import type { CmsMigration } from '${typesPath}'`,
      ``,
      `export declare const generated: boolean`,
      ``,
      `export declare const migrations: CmsMigration[]`,
      ``,
   ].join('\n')
}
