// Versioned database migrations. Use this, never `drizzle-kit push`, which can drop data.
//
//   NUXT_TURSO_URL=http://127.0.0.1:8080 pnpm db:migrate [--allow-remote]
import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client/http'
import { isLocalUrl } from './guard.mjs'
import * as scenarios from './migrations/0001-scenarios.mjs'

const BASELINE = new URL('../../db/migrations/0000_baseline.sql', import.meta.url)
const CREATE_LOG = 'create table if not exists _migrations (id text primary key not null, applied_at integer not null)'

/** The schema before this runner existed. Databases that already have it are only marked. */
const baseline = {
  id: '0000-baseline',
  async up(client, { record = [] } = {}) {
    const statements = readFileSync(BASELINE, 'utf8')
      .split(/;\s*(?:\n|$)/)
      .filter((statement) => statement.trim())
    await client.migrate([...statements, ...record])
  },
}

const MIGRATIONS = [baseline, scenarios]

async function tableNames(client) {
  const result = await client.execute(`select name from sqlite_schema where type = 'table'`)
  return new Set(result.rows.map((row) => String(row.name)))
}

/**
 * Applies the pending migrations in order. Each one runs, and is recorded in `_migrations`, in a
 * single transaction: a failure leaves the database as it was.
 *
 * @param {import('@libsql/client/http').Client} client
 * @param {{ log?: (line: string) => void }} [opts]
 * @returns {Promise<string[]>} the ids that were applied
 */
export async function migrate(client, { log = () => {} } = {}) {
  const tables = await tableNames(client)
  const recorded = new Set(
    tables.has('_migrations')
      ? (await client.execute('select id from _migrations')).rows.map((row) => String(row.id))
      : [],
  )

  // A database with `users` has the baseline schema already. It is marked as such in the same
  // transaction as the next migration, so a failed run does not even leave the mark behind.
  const unmarked = []
  if (!recorded.has(baseline.id) && tables.has('users')) {
    unmarked.push(baseline.id)
    recorded.add(baseline.id)
  }

  const pending = MIGRATIONS.filter((migration) => !recorded.has(migration.id))
  if (!pending.length) {
    if (unmarked.length) await client.migrate(recordStatements(unmarked))
    log('Nothing to do: the database is up to date.')
    return []
  }

  const applied = []
  for (const migration of pending) {
    log(`Applying ${migration.id}`)
    await migration.up(client, { record: recordStatements([...unmarked.splice(0), migration.id]), log })
    log(`Applied ${migration.id}`)
    applied.push(migration.id)
  }
  return applied
}

/** A plain insert: if another run recorded the same migration meanwhile, this one rolls back. */
function recordStatements(ids) {
  return [
    CREATE_LOG,
    ...ids.map((id) => ({ sql: 'insert into _migrations (id, applied_at) values (?, ?)', args: [id, Date.now()] })),
  ]
}

async function main(args) {
  const unknown = args.filter((arg) => arg !== '--allow-remote' && arg !== '--')
  if (unknown.length) throw new Error(`Unknown argument: ${unknown.join(' ')}`)

  // Only the environment decides the target; `.env` files are deliberately not loaded.
  const url = process.env.NUXT_TURSO_URL
  if (!url) throw new Error('Set NUXT_TURSO_URL to the database to migrate.')
  if (!isLocalUrl(url) && !args.includes('--allow-remote')) {
    throw new Error('NUXT_TURSO_URL is not a local database. Pass --allow-remote to migrate it anyway.')
  }

  const authToken = process.env.NUXT_TURSO_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined
  const client = createClient({ url, authToken })
  try {
    console.log(`Database: ${new URL(url).host}`)
    await migrate(client, { log: console.log })
  } finally {
    client.close()
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message)
    process.exitCode = 1
  })
}
