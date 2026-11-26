import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createClient, type Client } from '@libsql/client/http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEMO_NAMES, seedDemo } from '../../scripts/db/seed-demo.mjs'
import type { Scenario } from '../../shared/scenario/types'
import type { AttemptRow, QuestionWithStats, ScenarioDetail, ScenarioSummary } from '../../shared/types/qadb'
import { createApiTest, type ApiTest } from '../support/api-app'
import { FRONTEND_SCENARIO } from '../support/scenario-fixture'

const CLI = fileURLToPath(new URL('../../scripts/db/seed-demo.mjs', import.meta.url))
const [FRONTEND, FINANCE] = ['Front-end demo', 'Finance demo']
const TABLES = ['scenarios', 'attributes', 'options', 'questions', 'question_options', 'attempts']

let api: ApiTest
let client: Client
let user: Awaited<ReturnType<ApiTest['createUser']>>
let request: ReturnType<ApiTest['as']>

beforeEach(async () => {
  api = await createApiTest()
  client = createClient({ url: api.url })
  user = await api.createUser('demo_user')
  request = api.as(user)
})

afterEach(async () => {
  client.close()
  await api.close()
})

async function get<T>(url: string, send = request): Promise<T> {
  const res = await send('get', url)
  expect(res.status, url).toBe(200)
  return res.data as T
}

async function scenarioNamed(name: string): Promise<ScenarioDetail> {
  const found = (await get<ScenarioSummary[]>('/api/scenarios')).find((s) => s.name === name)!
  return get<ScenarioDetail>(`/api/scenarios/${found.id}`)
}

const questionsOf = (sid: string, query = '') =>
  get<QuestionWithStats[]>(`/api/scenarios/${sid}/questions${query}`)

async function rowCounts() {
  const counts: Record<string, number> = {}
  for (const table of TABLES) {
    counts[table] = Number((await client.execute(`select count(*) from ${table}`)).rows[0]![0])
  }
  return counts
}

const labels = (scenario: Scenario) =>
  Object.fromEntries(scenario.attributes.map((a) => [a.name, a.options.map((o) => o.label)]))

describe('seedDemo', () => {
  it('creates the front-end and finance demo scenarios for the user', async () => {
    await seedDemo(client, user.id)

    const summaries = await get<ScenarioSummary[]>('/api/scenarios')
    expect(summaries.map((s) => s.name)).toEqual([FRONTEND, FINANCE])
    expect(DEMO_NAMES).toEqual([FRONTEND, FINANCE])
    expect(summaries.map((s) => s.incompleteCount)).toEqual([0, 0])

    const frontend = await scenarioNamed(FRONTEND)
    expect(labels(frontend)).toEqual({
      Difficulty: ['Easy', 'Medium', 'Hard'],
      Importance: ['Low', 'Mid', 'High'],
      Category: ['HTML', 'CSS', 'JS', 'API', 'React'],
    })
    const finance = await scenarioNamed(FINANCE)
    expect(labels(finance)).toEqual({ Type: ['Domestic', 'Commerce', 'International'] })
    expect(finance.attributes[0]).toMatchObject({ selectionMode: 'single', required: true })
    // Every option is on show somewhere.
    for (const scenario of [frontend, finance]) {
      expect(Object.values(scenario.usage.optionCounts).every((n) => n > 0), scenario.name).toBe(true)
    }
  })

  it.each([FRONTEND, FINANCE])('gives %s a varied track record to filter and sort', async (name) => {
    await seedDemo(client, user.id)
    const { id } = await scenarioNamed(name)

    const all = await questionsOf(id)
    expect(all.length).toBeGreaterThanOrEqual(8)
    expect(new Set(all.map((q) => q.question)).size).toBe(all.length)
    expect(new Set(all.map((q) => q.created_at)).size).toBe(all.length)
    for (const filter of ['nbd=true', 'nbd=false', 'mastered=true', 'recentlyFailed=true']) {
      const some = await questionsOf(id, `?${filter}`)
      expect(some.length, filter).toBeGreaterThan(0)
      expect(some.length, filter).toBeLessThan(all.length)
    }
    expect(new Set(all.map((q) => q.stats.trackRecordPct)).size).toBeGreaterThan(3)

    const practiced = all.find((q) => q.stats.attemptCount > 1)!
    const { attempts } = await get<{ attempts: AttemptRow[] }>(`/api/questions/${practiced.id}`)
    const times = attempts.map((a) => a.answered_at)
    expect(new Set(times).size).toBe(times.length)
    expect(Math.max(...times)).toBeLessThan(Date.now())
    expect(Math.min(...times)).toBeGreaterThan(practiced.created_at)
  })

  it('can run again, replacing what it made before', async () => {
    await seedDemo(client, user.id)
    const counts = await rowCounts()
    const before = await scenarioNamed(FINANCE)
    // Changes to a demo scenario are thrown away.
    const added = await request('post', `/api/scenarios/${before.id}/questions`, {
      question: 'Added by hand?',
      answer: 'Yes.',
      values: { [before.attributes[0]!.id]: [before.attributes[0]!.options[0]!.id] },
    })
    expect(added.status).toBe(200)

    await seedDemo(client, user.id)

    expect((await get<ScenarioSummary[]>('/api/scenarios')).map((s) => s.name)).toEqual([FRONTEND, FINANCE])
    expect(await rowCounts()).toEqual(counts)
    expect((await scenarioNamed(FINANCE)).id).not.toBe(before.id)
  })

  it("leaves the user's other scenarios and other users alone", async () => {
    const own = await request('post', '/api/scenarios', FRONTEND_SCENARIO)
    const scenario = own.data as Scenario
    const values = Object.fromEntries(scenario.attributes.map((a) => [a.id, [a.options[0]!.id]]))
    const question = await request('post', `/api/scenarios/${scenario.id}/questions`, {
      question: 'Mine?',
      answer: 'Mine.',
      values,
    })
    await request('post', '/api/attempts', { questionId: question.data.id, correct: 1 })
    // Someone else's scenario with a demo name.
    const other = api.as(await api.createUser('someone_else'))
    await other('post', '/api/scenarios', { name: FINANCE, attributes: [] })
    const mine = await get(`/api/questions/${question.data.id}`)
    const theirs = await get<ScenarioSummary[]>('/api/scenarios', other)

    await seedDemo(client, user.id)
    await seedDemo(client, user.id)

    expect(await get(`/api/questions/${question.data.id}`)).toEqual(mine)
    expect(await get(`/api/scenarios/${scenario.id}`)).toMatchObject({ name: FRONTEND_SCENARIO.name })
    expect(await get('/api/scenarios', other)).toEqual(theirs)
    expect((await get<ScenarioSummary[]>('/api/scenarios')).map((s) => s.name)).toEqual([
      FRONTEND_SCENARIO.name,
      FRONTEND,
      FINANCE,
    ])
  })

  it('refuses a user that does not exist', async () => {
    await expect(seedDemo(client, 'nobody')).rejects.toThrow(/no user/i)

    expect((await rowCounts()).scenarios).toBe(0)
  })

  it('refuses, changing nothing, when a name differs from a demo one only in case', async () => {
    await request('post', '/api/scenarios', { name: 'finance DEMO', attributes: [] })

    await expect(seedDemo(client, user.id)).rejects.toThrow(/finance DEMO/)

    expect((await get<ScenarioSummary[]>('/api/scenarios')).map((s) => s.name)).toEqual(['finance DEMO'])
  })
})

describe('db:seed-demo', () => {
  const run = (args: string[], url: string | undefined) => {
    const env = { ...process.env, NUXT_TURSO_URL: url }
    if (url === undefined) delete env.NUXT_TURSO_URL
    return spawnSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8', timeout: 20_000 })
  }

  it('seeds the named user', async () => {
    const result = run(['--', '--user', user.username], api.url)

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(FINANCE)
    expect((await get<ScenarioSummary[]>('/api/scenarios')).map((s) => s.name)).toEqual([FRONTEND, FINANCE])
  })

  it.each([
    'libsql://qadb.example.invalid',
    'https://qadb.example.invalid',
    'http://127.0.0.1.example.invalid:8080',
    'http://localhost@qadb.example.invalid',
    'file:local.db',
  ])('refuses %s, which is not a local database', (url) => {
    const result = run(['--user', user.username], url)

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/not a local database/)
    expect(result.stdout).toBe('')
  })

  it.each([
    ['no address', ['--user', 'demo_user'], undefined, /NUXT_TURSO_URL/],
    ['no user', [], 'local', /Usage/],
    ['a flag without a name', ['--user'], 'local', /Usage/],
    ['an override flag', ['--user', 'demo_user', '--allow-remote'], 'local', /Usage/],
    ['an unknown user', ['--user', 'nobody'], 'local', /no user/i],
  ])('stops on %s', async (_name, args, url, message) => {
    const result = run(args, url && api.url)

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(message)
    expect((await rowCounts()).scenarios).toBe(0)
  })
})
