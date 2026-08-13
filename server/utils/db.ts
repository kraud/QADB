// Use the pure-JS hrana client (`@libsql/client/http` + `drizzle-orm/libsql/http`).
//
// The default `@libsql/client` / `drizzle-orm/libsql` entries statically load
// the native `libsql` package, which requires a platform binary
// (`@libsql/<platform>`) via a dynamic import. Nitro's module tracer can't
// bundle that binary, so the production/Vercel server crashes at startup with
// "Cannot find module '@libsql/<platform>'". The http subpath has no native
// dependency and serves Turso (`libsql://` → `https://`) over hrana.
//
// Tradeoff: `file:` (local SQLite) URLs are not supported by the http client —
// this project runs against Turso (see the design doc's "no local-file fallback").
import { createClient } from '@libsql/client/http'
import { drizzle } from 'drizzle-orm/libsql/http'
import * as schema from '../../db/schema'

const config = useRuntimeConfig()

const client = createClient({
  url: config.tursoUrl,
  // Nuxt only auto-maps `NUXT_`-prefixed env vars into runtimeConfig, so
  // `TURSO_AUTH_TOKEN` (the Turso/drizzle-kit convention) needs an explicit read.
  authToken: config.tursoToken || process.env.TURSO_AUTH_TOKEN || undefined,
})

export const db = drizzle(client, { schema })
