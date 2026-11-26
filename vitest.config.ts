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
    coverage: {
      provider: 'v8',
      include: ['server/**', 'shared/**', 'app/utils/**', 'app/stores/**'],
    },
  },
})
