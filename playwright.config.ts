import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const APP_URL = 'http://localhost:3100'
/** The same build with registration left at its default. */
const CLOSED_APP_URL = 'http://localhost:3101'
const DB_URL = 'http://127.0.0.1:8180'
const AI_URL = 'http://127.0.0.1:8190'
const DB_DIR = join(tmpdir(), 'qadb-e2e-db')

// Reuse the pnpm that started the run: a bare `pnpm` can resolve to an older major.
const execPath = process.env.npm_execpath
const PNPM = execPath?.includes('pnpm') ? `"${execPath}"` : 'pnpm'

// These take precedence over `.env`, so the run never sees the developer's database or keys.
const appEnv = {
  HOST: '127.0.0.1',
  NUXT_TURSO_URL: DB_URL,
  TURSO_AUTH_TOKEN: '',
  NUXT_TURSO_TOKEN: '',
  NUXT_SESSION_PASSWORD: 'qadb-e2e-only-session-password-not-a-secret',
  NUXT_SESSION_COOKIE_SECURE: 'false',
  NUXT_OPENCODE_URL: AI_URL,
  OPENCODE_API_KEY: 'stub',
}

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './tests/support/global-setup.ts',
  metadata: { appUrl: APP_URL, closedAppUrl: CLOSED_APP_URL, dbUrl: DB_URL },
  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'db',
      command: `rm -rf "${DB_DIR}" && exec sqld --no-welcome -d "${DB_DIR}" --http-listen-addr 127.0.0.1:8180`,
      url: `${DB_URL}/health`,
      reuseExistingServer: false,
    },
    {
      name: 'ai-stub',
      command: 'node tests/support/ai-stub.mjs 8190',
      url: AI_URL,
      reuseExistingServer: false,
    },
    {
      name: 'app',
      command: `${PNPM} build && node .output/server/index.mjs`,
      url: `${APP_URL}/login`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { ...appEnv, PORT: '3100', NUXT_PUBLIC_REGISTRATION_OPEN: 'true' },
    },
    {
      // Starts after the one above is up, and so after the build.
      name: 'app-closed',
      command: 'node .output/server/index.mjs',
      url: `${CLOSED_APP_URL}/login`,
      reuseExistingServer: false,
      env: { ...appEnv, PORT: '3101', NUXT_PUBLIC_REGISTRATION_OPEN: 'false' },
    },
  ],
})
