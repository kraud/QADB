import { createClient } from '@libsql/client/http'
import type { FullConfig } from '@playwright/test'
import { migrate } from '../../scripts/db/migrate.mjs'
import { loadTestUser } from './test-user'

const LOCAL_HOSTS = ['127.0.0.1', 'localhost']

/** Prepares the empty e2e database and the test account. Runs after the web servers are up. */
export default async function globalSetup(config: FullConfig) {
  const { dbUrl, appUrl } = config.metadata as { dbUrl: string; appUrl: string }

  const { hostname } = new URL(dbUrl)
  if (!LOCAL_HOSTS.includes(hostname)) {
    throw new Error(`E2E tests only run against a local database, refusing host "${hostname}"`)
  }

  const client = createClient({ url: dbUrl })
  try {
    await migrate(client)
  } finally {
    client.close()
  }

  const res = await fetch(`${appUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(loadTestUser()),
  })
  if (!res.ok) {
    throw new Error(`Could not register the test user: ${res.status} ${res.statusText}`)
  }
}
