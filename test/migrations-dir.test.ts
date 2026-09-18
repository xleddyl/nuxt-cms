import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { migrationsDirFor } from '../src/runtime/shared/migrations-dir'

const temporaryDirs: string[] = []

async function makeRoot(existingDrivers: string[] = []): Promise<string> {
   const root = await mkdtemp(join(tmpdir(), 'nuxt-cms-migrations-dir-'))
   temporaryDirs.push(root)
   for (const driver of existingDrivers) {
      await mkdir(join(root, 'server/db/migrations', driver), { recursive: true })
   }
   return root
}

afterAll(async () => {
   await Promise.all(temporaryDirs.map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('migrationsDirFor', () => {
   it('keeps postgres in its own folder', async () => {
      const root = await makeRoot(['postgres'])
      expect(migrationsDirFor(root, 'postgres')).toBe(join(root, 'server/db/migrations/postgres'))
   })

   it('keeps sqlite in its own folder', async () => {
      const root = await makeRoot(['sqlite'])
      expect(migrationsDirFor(root, 'sqlite')).toBe(join(root, 'server/db/migrations/sqlite'))
   })

   it('lets libsql share the sqlite migrations', async () => {
      const root = await makeRoot(['sqlite'])
      expect(migrationsDirFor(root, 'libsql')).toBe(join(root, 'server/db/migrations/sqlite'))
   })

   it('lets d1 share the sqlite migrations', async () => {
      const root = await makeRoot(['sqlite'])
      expect(migrationsDirFor(root, 'd1')).toBe(join(root, 'server/db/migrations/sqlite'))
   })

   it('keeps an existing libsql folder', async () => {
      const root = await makeRoot(['sqlite', 'libsql'])
      expect(migrationsDirFor(root, 'libsql')).toBe(join(root, 'server/db/migrations/libsql'))
   })

   it('falls back to sqlite when no folder exists yet', async () => {
      const root = await makeRoot()
      expect(migrationsDirFor(root, 'libsql')).toBe(join(root, 'server/db/migrations/sqlite'))
   })
})
