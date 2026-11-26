import { createId } from '@paralleldrive/cuid2'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { attempts, attributes, options, questionOptions, questions } from '../../db/schema'
import type { AuthUser } from '../../server/utils/auth'
import { createApiTest, type ApiTest } from '../support/api-app'
import { createQuestionScenario } from '../support/question-scenario'

let api: ApiTest
let alice: AuthUser
let s: Awaited<ReturnType<typeof createQuestionScenario>>
/** Questions inserted so far; each one is a millisecond newer than the one before. */
let clock: number

beforeEach(async () => {
  api = await createApiTest()
  alice = await api.createUser('alice')
  s = await createQuestionScenario(api, alice)
  clock = 0
})

afterEach(async () => {
  await api.close()
})

interface Seed {
  /** Option labels. */
  has?: string[]
  mastered?: 0 | 1
  /** Results, oldest first. */
  results?: (0 | 1)[]
  createdAt?: number
  id?: string
  into?: typeof s
}

async function add(text: string, seed: Seed = {}): Promise<string> {
  const into = seed.into ?? s
  const id = seed.id ?? createId()
  const at = seed.createdAt ?? ++clock
  await api.db.insert(questions).values({
    id,
    scenario_id: into.sid,
    question: text,
    answer: 'A',
    mastered: seed.mastered ?? 0,
    created_at: at,
    updated_at: at,
  })
  for (const label of seed.has ?? []) {
    await api.db.insert(questionOptions).values({ question_id: id, option_id: into.ids[label]! })
  }
  for (const [index, correct] of (seed.results ?? []).entries()) {
    await api.db
      .insert(attempts)
      .values({ id: createId(), question_id: id, user_id: alice.id, correct, answered_at: 100 + index })
  }
  return id
}

type Params = [string, string][] | Record<string, string>

async function list(params: Params = {}, sid = s.sid): Promise<any[]> {
  const res = await api.as(alice)('get', `/api/scenarios/${sid}/questions?${new URLSearchParams(params)}`)
  expect(res.status, JSON.stringify(res.data)).toBe(200)
  return res.data
}

const texts = async (params?: Params) => (await list(params)).map((q) => q.question)

describe('listing', () => {
  it("lists only the scenario's questions", async () => {
    const other = await createQuestionScenario(api, alice, 'Other')
    const mine = await add('mine', { has: ['Easy', 'JS'], results: [1] })
    const theirs = await add('theirs', { into: other, has: ['Hard', 'CSS'] })
    const second = await add('second')

    expect(await list()).toEqual([
      {
        id: mine,
        scenarioId: s.sid,
        question: 'mine',
        answer: 'A',
        link: null,
        mastered: 0,
        created_at: 1,
        updated_at: 1,
        values: s.values('Easy', 'JS'),
        incomplete: false,
        stats: { attemptCount: 1, correctCount: 1, trackRecordPct: 100, lastAnsweredAt: 100, lastCorrect: 1 },
      },
      expect.objectContaining({ id: second, values: s.values(), incomplete: true }),
    ])
    expect(await list({}, other.sid)).toEqual([
      expect.objectContaining({ id: theirs, scenarioId: other.sid, values: other.values('Hard', 'CSS') }),
    ])

    const ids = await api.as(alice)('get', `/api/scenarios/${s.sid}/questions/ids`)
    expect(ids).toEqual({ status: 200, data: [{ id: mine }, { id: second }] })
  })

  it('orders by creation, then id', async () => {
    await add('later', { createdAt: 5, id: 'a' })
    await add('tie b', { createdAt: 3, id: 'c' })
    await add('tie a', { createdAt: 3, id: 'b' })

    expect(await texts()).toEqual(['tie a', 'tie b', 'later'])
    expect((await api.as(alice)('get', `/api/scenarios/${s.sid}/questions/ids`)).data).toEqual(
      [{ id: 'b' }, { id: 'c' }, { id: 'a' }],
    )
  })

  it('lists nothing in an empty scenario', async () => {
    expect(await list()).toEqual([])
  })
})

describe('attribute filters', () => {
  beforeEach(async () => {
    await add('easy html', { has: ['Easy', 'HTML'] })
    await add('easy css js eu', { has: ['Easy', 'CSS', 'JS', 'EU'] })
    await add('hard js us', { has: ['Hard', 'JS', 'US'] })
    await add('medium', { has: ['Medium'] })
    await add('bare')
  })

  const option = (...labels: string[]) => labels.map((label): [string, string] => ['option', s.ids[label]!])

  it('OR within an attribute, AND across attributes', async () => {
    expect(await texts(option('HTML'))).toEqual(['easy html'])
    expect(await texts(option('HTML', 'JS'))).toEqual(['easy html', 'easy css js eu', 'hard js us'])
    // A question holding both chosen options is listed once.
    expect(await texts(option('CSS', 'JS'))).toEqual(['easy css js eu', 'hard js us'])
    expect(await texts(option('Easy', 'JS'))).toEqual(['easy css js eu'])
    expect(await texts(option('Easy', 'Hard', 'JS'))).toEqual(['easy css js eu', 'hard js us'])
    expect(await texts(option('Easy', 'JS', 'US'))).toEqual([])
  })

  it('none, alone and combined with options', async () => {
    expect(await texts([['none', s.topic]])).toEqual(['medium', 'bare'])
    expect(await texts([['none', s.region]])).toEqual(['easy html', 'medium', 'bare'])
    expect(await texts([['none', s.region], ...option('US')])).toEqual(['easy html', 'hard js us', 'medium', 'bare'])
    expect(await texts([['none', s.topic], ['none', s.region]])).toEqual(['medium', 'bare'])
    expect(await texts([['none', s.topic], ...option('HTML', 'Easy')])).toEqual(['easy html'])
    expect(await texts([['none', s.level], ['none', s.topic]])).toEqual(['bare'])
  })

  it('returns all of a matching question\'s values', async () => {
    const [found] = await list(option('CSS'))

    expect(found.values).toEqual(s.values('Easy', 'CSS', 'JS', 'EU'))
  })

  it('incomplete filter', async () => {
    expect(await texts({ incomplete: 'true' })).toEqual(['medium', 'bare'])
    expect((await list()).map((q) => q.incomplete)).toEqual([false, false, false, true, true])
    expect(await texts([['incomplete', 'true'], ...option('Medium')])).toEqual(['medium'])
  })

  it('ignores deleted or unknown filter and sort ids', async () => {
    const other = await createQuestionScenario(api, alice, 'Other')
    const junk: [string, string][] = [
      ...['nope', '__proto__', 'constructor', 'attr:toString', other.ids.Easy!, s.level].map(
        (id): [string, string] => ['option', id],
      ),
      ...['nope', '__proto__', 'toString', 'attr:toString', other.level, s.ids.Easy!].map(
        (id): [string, string] => ['none', id],
      ),
    ]
    const all = await texts()

    expect(await texts(junk)).toEqual(all)
    expect(await texts([...junk, ...option('JS')])).toEqual(await texts(option('JS')))
    for (const sortKey of ['attr:nope', 'attr:__proto__', 'attr:toString', `attr:${other.level}`, 'nope']) {
      expect(await texts({ sortKey, sortDir: 'desc' }), sortKey).toEqual(all)
    }
    // Topic and Region are not ordered.
    for (const id of [s.topic, s.region]) {
      expect(await texts({ sortKey: `attr:${id}`, sortDir: 'desc' })).toEqual(all)
    }

    // The same after the chosen option and the sorted attribute are deleted.
    const filtered = await texts(option('Easy'))
    const body = {
      name: s.scenario.name,
      attributes: s.scenario.attributes
        .filter((attribute) => attribute.id !== s.region)
        .map(({ position: _, options, ...attribute }) => ({
          ...attribute,
          options: options.filter((o) => o.label !== 'JS').map(({ position: _position, ...rest }) => rest),
        })),
    }
    const saved = await api.as(alice)('put', `/api/scenarios/${s.sid}`, {
      scenario: body,
      resolutions: { removedOptions: { [s.ids.JS!]: { moveTo: null } }, removedAttributes: [s.region] },
    })
    expect(saved.status, JSON.stringify(saved.data)).toBe(200)

    expect(
      await texts([...option('Easy', 'JS', 'US'), ['none', s.region], ['sortKey', `attr:${s.region}`]]),
    ).toEqual(filtered)
  })

  it('copes with very long id lists and searches', async () => {
    const unknown = Array.from({ length: 3000 }, (_, i): [string, string] => [i % 2 ? 'option' : 'none', `id${i}`])
    expect(await texts(unknown)).toEqual(await texts())
    expect(await texts([...unknown, ...option(...Array<string>(2000).fill('HTML'))])).toEqual(['easy html'])

    const manyWords = Array.from({ length: 3000 }, (_, i) => `w${i}`).join(' ')
    expect(await texts({ q: manyWords })).toEqual([])
    expect(await texts({ q: 'e '.repeat(3000) })).toEqual(['easy html', 'easy css js eu', 'medium', 'bare'])
    expect(await texts({ q: 'x'.repeat(60_000) })).toEqual([])
    expect(await texts({ amountOp: 'lt', amountValue: '9'.repeat(400) })).toEqual(await texts())
  })

  it('copes with filters on very many attributes', async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => `extra${i}`)
    await api.db.batch([
      api.db.insert(attributes).values({ id: ids[0]!, scenario_id: s.sid, name: ids[0]!, selection_mode: 'single', position: 3 }),
      ...ids.slice(1).map((id, i) =>
        api.db.insert(attributes).values({ id, scenario_id: s.sid, name: id, selection_mode: 'single', position: 4 + i }),
      ),
      ...ids.map((id) =>
        api.db.insert(options).values({ id: `${id}-o`, attribute_id: id, label: 'o', color: 'green', position: 0 }),
      ),
    ])

    expect(await texts(ids.map((id): [string, string] => ['none', id]))).toHaveLength(5)
    expect(await texts(ids.map((id): [string, string] => ['option', `${id}-o`]))).toEqual([])
  })
})

describe('track record filters', () => {
  beforeEach(async () => {
    await add('never', { mastered: 1 })
    await add('failed last', { results: [1, 0] })
    await add('recovered', { results: [0, 1], mastered: 1 })
    await add('thrice', { results: [1, 1, 1] })
  })

  it('nbd', async () => {
    expect(await texts({ nbd: 'true' })).toEqual(['never'])
    expect(await texts({ nbd: 'false' })).toEqual(['failed last', 'recovered', 'thrice'])
  })

  it('mastered', async () => {
    expect(await texts({ mastered: 'true' })).toEqual(['never', 'recovered'])
    expect(await texts({ mastered: 'false' })).toEqual(['failed last', 'thrice'])
  })

  it('amount gt/lt/eq', async () => {
    expect(await texts({ amountOp: 'gt', amountValue: '2' })).toEqual(['thrice'])
    expect(await texts({ amountOp: 'lt', amountValue: '2' })).toEqual(['never'])
    expect(await texts({ amountOp: 'eq', amountValue: '2' })).toEqual(['failed last', 'recovered'])
    expect(await texts({ amountOp: 'eq', amountValue: '0' })).toEqual(['never'])
  })

  it('recently failed', async () => {
    expect(await texts({ recentlyFailed: 'true' })).toEqual(['failed last'])
  })

  it('combines them', async () => {
    expect(await texts({ mastered: 'true', nbd: 'false' })).toEqual(['recovered'])
  })
})

describe('search', () => {
  it('multi-word search with % and _', async () => {
    await add('What is 100% of a_b?')
    await add('What is 100 of axb?')
    await add('Wow! A % sign')

    expect(await texts({ q: 'what OF' })).toEqual(['What is 100% of a_b?', 'What is 100 of axb?'])
    expect(await texts({ q: '  of   what ' })).toEqual(['What is 100% of a_b?', 'What is 100 of axb?'])
    expect(await texts({ q: '100%' })).toEqual(['What is 100% of a_b?'])
    expect(await texts({ q: 'a_b' })).toEqual(['What is 100% of a_b?'])
    expect(await texts({ q: '%' })).toEqual(['What is 100% of a_b?', 'Wow! A % sign'])
    expect(await texts({ q: 'wow! %' })).toEqual(['Wow! A % sign'])
    expect(await texts({ q: 'what sign' })).toEqual([])
    expect(await texts({ q: "' or 1=1 --" })).toEqual([])
  })
})

describe('sorting', () => {
  it('sorts by ordered attribute both ways with empty last', async () => {
    await add('hard', { has: ['Hard'] })
    await add('empty 1', { has: ['JS'] })
    await add('easy 1', { has: ['Easy'] })
    await add('medium', { has: ['Medium'] })
    await add('empty 2')
    await add('easy 2', { has: ['Easy'] })
    const sortKey = `attr:${s.level}`

    expect(await texts({ sortKey })).toEqual(['easy 1', 'easy 2', 'medium', 'hard', 'empty 1', 'empty 2'])
    expect(await texts({ sortKey, sortDir: 'desc' })).toEqual(['hard', 'medium', 'easy 1', 'easy 2', 'empty 1', 'empty 2'])
  })

  it('sorts by pct and amount as before', async () => {
    await add('half', { results: [1, 0] })
    await add('new 1')
    await add('all', { results: [1] })
    await add('zero', { results: [0, 0, 0] })
    await add('new 2')

    // Never answered counts as the lowest percentage.
    expect(await texts({ sortKey: 'pct' })).toEqual(['new 1', 'new 2', 'zero', 'half', 'all'])
    expect(await texts({ sortKey: 'pct', sortDir: 'desc' })).toEqual(['all', 'half', 'zero', 'new 1', 'new 2'])
    expect(await texts({ sortKey: 'amount' })).toEqual(['new 1', 'new 2', 'all', 'half', 'zero'])
    expect(await texts({ sortKey: 'amount', sortDir: 'desc' })).toEqual(['zero', 'half', 'all', 'new 1', 'new 2'])
  })

  it('sorts what the filters leave', async () => {
    await add('hard js', { has: ['Hard', 'JS'] })
    await add('easy css', { has: ['Easy', 'CSS'] })
    await add('easy js', { has: ['Easy', 'JS'] })

    expect(await texts({ sortKey: `attr:${s.level}`, option: s.ids.JS! })).toEqual(['easy js', 'hard js'])
  })
})
