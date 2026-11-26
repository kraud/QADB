import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const dir = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '~': dir('./app'),
      '#shared': dir('./shared'),
    },
  },
  test: {
    // Playwright owns `*.spec.ts`; Vitest only runs `*.test.ts`.
    include: ['tests/**/*.test.ts'],
    // API tests start and stop a database server around each test, which is slow on a busy machine.
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['server/**', 'shared/**', 'app/utils/**', 'app/stores/**'],
      // Components, pages and composables are covered by the end-to-end tests.
      thresholds: { lines: 90 },
    },
  },
})
