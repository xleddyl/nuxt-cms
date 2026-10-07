import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
   resolve: {
      alias: {
         '#imports': fileURLToPath(new URL('./test/stubs/imports.ts', import.meta.url)),
         '#cms-blocks': fileURLToPath(new URL('./test/stubs/cms-blocks.ts', import.meta.url)),
         '#cms-config': fileURLToPath(new URL('./test/stubs/cms-config.ts', import.meta.url)),
         '#cms-db': fileURLToPath(new URL('./test/stubs/cms-db.ts', import.meta.url)),
         '#cms-tables': fileURLToPath(new URL('./test/stubs/cms-tables.ts', import.meta.url)),
      },
   },
   test: {
      include: ['test/**/*.test.ts'],
   },
})
