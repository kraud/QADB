import { defineConfig } from 'drizzle-kit'

const url = process.env.NUXT_TURSO_URL || process.env.TURSO_URL || ''
const isFile = url.startsWith('file:')

export default defineConfig({
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: isFile ? 'sqlite' : 'turso',
  dbCredentials: isFile
    ? { url }
    : { url, authToken: process.env.TURSO_AUTH_TOKEN || '' },
})
