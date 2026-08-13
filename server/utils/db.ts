// `@libsql/client` (main entry) is required: drizzle-orm's libsql driver
// statically imports it, and it handles both Turso (`libsql://`) and local
// `file:` URLs. Its native `libsql` package loads a platform binding
// (`@libsql/<platform>`) that Nitro's tracer can't bundle — the `postbuild`
// script copies that binding into `.output/server/node_modules` (see
// scripts/copy-libsql-binding.mjs).
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../../db/schema'

const config = useRuntimeConfig()

const client = createClient({
  url: config.tursoUrl,
  // Nuxt only auto-maps `NUXT_`-prefixed env vars into runtimeConfig, so
  // `TURSO_AUTH_TOKEN` (the Turso/drizzle-kit convention) needs an explicit read.
  authToken: config.tursoToken || process.env.TURSO_AUTH_TOKEN || undefined,
})

export const db = drizzle(client, { schema })
