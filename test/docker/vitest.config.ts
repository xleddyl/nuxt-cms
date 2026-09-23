import { defineConfig } from 'vitest/config'

export default defineConfig({
   test: {
      include: ['test/docker/**/*.docker.ts'],
      hookTimeout: 20 * 60_000,
      testTimeout: 60_000,
      fileParallelism: false,
   },
})
