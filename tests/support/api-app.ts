// Runs the real route files on an h3 app, against a throwaway database.
import { createClient } from '@libsql/client/http'
import { createId } from '@paralleldrive/cuid2'
import {
  createApp,
  createError,
  createRouter,
  defineEventHandler,
  getHeader,
  getQuery,
  getRouterParam,
  readBody,
  setResponseStatus,
  toWebHandler,
  type EventHandler,
  type H3Event,
  type RouterMethod,
} from 'h3'
import { vi } from 'vitest'
import { users } from '../../db/schema'
import { migrate } from '../../scripts/db/migrate.mjs'
import type { AuthUser } from '../../server/utils/auth'
import type { Db } from '../../server/utils/db'
import { startDbServer } from './db-server'

/** Every route under test. A new route file gets one line here. */
const ROUTES: [RouterMethod, string, () => Promise<{ default: EventHandler }>][] = [
  ['get', '/api/scenarios', () => import('../../server/api/scenarios/index.get')],
  ['post', '/api/scenarios', () => import('../../server/api/scenarios/index.post')],
  ['get', '/api/scenarios/:sid', () => import('../../server/api/scenarios/[sid]/index.get')],
  ['put', '/api/scenarios/:sid', () => import('../../server/api/scenarios/[sid]/index.put')],
  ['delete', '/api/scenarios/:sid', () => import('../../server/api/scenarios/[sid]/index.delete')],
]

/** Stands in for the sealed session cookie. */
const USER_HEADER = 'x-test-user'

export interface ApiResponse {
  status: number
  // The wire format differs per route; tests assert on it directly.
  data: any
}

export async function createApiTest() {
  const server = await startDbServer()
  try {
    return await buildApiTest(server)
  } catch (err) {
    await server.stop()
    throw err
  }
}

async function buildApiTest(server: Awaited<ReturnType<typeof startDbServer>>) {
  const client = createClient({ url: server.url })
  await migrate(client)
  client.close()

  const accounts = new Map<string, AuthUser>()

  // What Nitro would auto-import. Set before the server modules load, as some use it at import time.
  const globals = {
    createError,
    defineEventHandler,
    getQuery,
    getRouterParam,
    readBody,
    setResponseStatus,
    useRuntimeConfig: () => ({ tursoUrl: server.url, tursoToken: '' }),
    getUserSession: async (event: H3Event) => ({ user: accounts.get(getHeader(event, USER_HEADER) ?? '') }),
  }
  for (const [name, value] of Object.entries(globals)) vi.stubGlobal(name, value)
  // A token in the developer's shell is none of the test server's business.
  vi.stubEnv('TURSO_AUTH_TOKEN', '')
  // `server/utils/db` connects at import time, so each test app needs its own copy.
  vi.resetModules()

  const { db } = await import('../../server/utils/db')
  const { getSessionUser, requireUser } = await import('../../server/utils/auth')
  vi.stubGlobal('db', db)
  vi.stubGlobal('getSessionUser', getSessionUser)
  vi.stubGlobal('requireUser', requireUser)

  const app = createApp()
  app.use((await import('../../server/middleware/01.session')).default)
  const router = createRouter()
  for (const [method, path, load] of ROUTES) router.use(path, (await load()).default, method)
  app.use(router)
  const handle = toWebHandler(app)

  return {
    db: db as Db,

    /** A request function signed in as `user`, or anonymous with `null`. */
    as(user: AuthUser | null) {
      return async (method: string, url: string, body?: unknown): Promise<ApiResponse> => {
        const headers: Record<string, string> = {}
        if (user) headers[USER_HEADER] = user.id
        if (body !== undefined) headers['content-type'] = 'application/json'
        const response = await handle(
          new Request(`http://qadb.test${url}`, {
            method: method.toUpperCase(),
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
          }),
        )
        const text = await response.text()
        return { status: response.status, data: text ? JSON.parse(text) : null }
      }
    },

    async createUser(username: string): Promise<AuthUser> {
      const user = { id: createId(), username }
      await db.insert(users).values({ ...user, password_hash: 'not-a-real-hash' })
      accounts.set(user.id, user)
      return user
    },

    async close() {
      db.$client.close()
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
      await server.stop()
    },
  }
}

export type ApiTest = Awaited<ReturnType<typeof buildApiTest>>
