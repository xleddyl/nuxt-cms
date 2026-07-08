import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

export interface GenerateMigrationsOptions {
   root?: string
   configPath?: string
}

export async function generateMigrations(opts: GenerateMigrationsOptions = {}): Promise<void> {
   const root = opts.root ?? process.cwd()
   const configPath = opts.configPath ?? join(root, '.nuxt/cms/drizzle.config.ts')
   if (!existsSync(configPath)) {
      throw new Error(
         `[nuxt-cms] drizzle config not found at ${configPath} — run \`nuxi prepare\` first.`
      )
   }
   const require = createRequire(import.meta.url)
   const bin = join(dirname(require.resolve('drizzle-kit')), 'bin.cjs')
   const code = await new Promise<number>((done) => {
      spawn(process.execPath, [bin, 'generate', `--config=${configPath}`], {
         cwd: root,
         stdio: 'inherit',
      })
         .on('close', (c) => done(c ?? 1))
         .on('error', () => done(1))
   })
   if (code !== 0) throw new Error(`[nuxt-cms] drizzle-kit generate failed (exit ${code})`)
}
