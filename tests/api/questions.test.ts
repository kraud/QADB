import { createId } from '@paralleldrive/cuid2'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attempts, attributes, options, questionOptions, questions } from '../../db/schema'
import type { AuthUser } from '../../server/utils/auth'
import { createApiTest, type ApiTest } from '../support/api-app'
import { createQuestionScenario } from '../support/question-scenario'

let api: ApiTest
let alice: AuthUser
let bob: AuthUser
let s: Awaited<ReturnType<typeof createQuestionScenario>>

beforeEach(async () => {
  api = await createApiTest()
  alice = await api.createUser('alice')
  bob = await api.createUser('bob')
  s = await createQuestionScenario(api, alice)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await api.close()
})

const body = (extra: object = {}) => ({
  question: 'What is a closure?',
  answer: 'A function with its scope.',
  values: s.values('Easy', 'JS'),
  ...extra,
})

async function create(extra: object = {}) {
  const res = await api.as(alice)('post', `/api/scenarios/${s.sid}/questions`, body(extra))
  expect(res.status, JSON.stringify(res.data)).toBe(200)
  return res.data
}

/** A question inserted directly, so that it may lack required values. */
async function addIncomplete(...labels: string[]): Promise<string> {
  const id = createId()
  await api.db.insert(questions).values({ id, scenario_id: s.sid, question: 'Q', answer: 'A', created_at: 1, updated_at: 1 })
  for (const label of labels) await api.db.insert(questionOptions).values({ question_id: id, option_id: s.ids[label]! })
  return id
}

/** Every row of every table a question write can touch. */
async function stored() {
  const { db } = api
  return {
    questions: await db.select().from(questions),
    questionOptions: await db.select().from(questionOptions),
    attempts: await db.select().from(attempts),
  }
}

const empty = { questions: [], questionOptions: [], attempts: [] }

const get = (id: string) => api.as(alice)('get', `/api/questions/${id}`)
const patch = (id: string, changes: unknown) => api.as(alice)('patch', `/api/questions/${id}`, changes)

describe('creating a question', () => {
  it('creates with values and returns it as it reads back', async () => {
    const values = s.values('Hard', 'HTML', 'JS', 'EU')
    // Sent out of option order, returned in it.
    values[s.topic]!.reverse()

    const created = await create({ question: '  Why?  ', answer: '  Because.  ', link: '  https://example.com  ', values })

    expect(created).toEqual({
      id: expect.any(String),
      scenarioId: s.sid,
      question: 'Why?',
      answer: 'Because.',
      link: 'https://example.com',
      mastered: 0,
      created_at: expect.any(Number),
      updated_at: created.created_at,
      values: s.values('Hard', 'HTML', 'JS', 'EU'),
      incomplete: false,
      stats: { attemptCount: 0, correctCount: 0, trackRecordPct: null, lastAnsweredAt: null, lastCorrect: null },
    })
    expect((await get(created.id)).data).toEqual({ ...created, attempts: [] })
    expect((await stored()).questionOptions).toHaveLength(4)
  })

  it('stores a bare domain as an https address', async () => {
    const created = await create({ link: ' example.com/docs ' })

    expect(created.link).toBe('https://example.com/docs')
    expect((await patch(created.id, { link: 'example.org' })).data.link).toBe('https://example.org')
  })

  it('names the link in the refusal, which the editor shows beside the field', async () => {
    const res = await api.as(alice)('post', `/api/scenarios/${s.sid}/questions`, body({ link: 'not a link' }))

    expect(res.status).toBe(422)
    expect(res.data.data.map((issue: { path: string[] }) => issue.path)).toEqual([['link']])
  })

  it('counts the added https towards the length limit', async () => {
    const link = `example.com/${'x'.repeat(2030)}`

    expect((await api.as(alice)('post', `/api/scenarios/${s.sid}/questions`, body({ link }))).status).toBe(422)
  })

  it('gives every attribute an entry and takes a blank link as none', async () => {
    const { [s.region]: _, ...values } = s.values('Easy', 'JS')

    const created = await create({ link: '   ', values })

    expect(created.link).toBeNull()
    expect(created.values).toEqual(s.values('Easy', 'JS'))
  })

  it('creates in a scenario without attributes', async () => {
    const plain = (await api.as(alice)('post', '/api/scenarios', { name: 'Plain', attributes: [] })).data

    const res = await api.as(alice)('post', `/api/scenarios/${plain.id}/questions`, body({ values: {} }))

    expect(res.status).toBe(200)
    expect(res.data).toMatchObject({ scenarioId: plain.id, values: {}, incomplete: false })
  })

  it('rejects missing required, two in single mode, foreign option ids', async () => {
    const other = await createQuestionScenario(api, alice, 'Other')
    const valid = s.values('Easy', 'JS')
    const cases: [string, Record<string, string[]>, string][] = [
      ['missing required', s.values('Easy'), s.topic],
      ['no values at all', {}, s.level],
      ['two in single mode', s.values('Easy', 'Hard', 'JS'), s.level],
      ['an option of another scenario', { ...valid, [s.level]: [other.ids.Easy!] }, s.level],
      ['an option of another attribute', { ...valid, [s.level]: [s.ids.JS!] }, s.level],
      ['an attribute of another scenario', { ...valid, [other.level]: [other.ids.Easy!] }, other.level],
      ['an option twice', { ...valid, [s.topic]: [s.ids.JS!, s.ids.JS!] }, s.topic],
      ['an odd attribute id', { ...valid, 'attr:toString': [] }, 'attr:toString'],
      ['a prototype name', { ...valid, toString: [] }, 'toString'],
    ]

    for (const [name, values, attributeId] of cases) {
      const res = await api.as(alice)('post', `/api/scenarios/${s.sid}/questions`, body({ values }))

      expect(res.status, name).toBe(422)
      expect(res.data.data, name).toContainEqual({ path: ['values', attributeId], message: expect.any(String) })
    }
    expect(await stored()).toEqual(empty)
  })

  it('never fails on prototype names in the body', async () => {
    // The request body parser itself refuses some of them.
    for (const key of ['__proto__', 'constructor']) {
      const sent = JSON.parse(`{"question":"Q","answer":"A","values":{"${key}":["x"]}}`)
      const res = await api.as(alice)('post', `/api/scenarios/${s.sid}/questions`, sent)

      expect([400, 422], key).toContain(res.status)
    }
    expect(await stored()).toEqual(empty)
  })

  it.each([
    ['no body', () => undefined],
    ['a blank question', () => body({ question: '  ' })],
    ['a blank answer', () => body({ answer: '' })],
    ['a long link', () => body({ link: 'x'.repeat(2049) })],
    ['a link that is not a web address', () => body({ link: 'javascript:alert(1)' })],
    ['no values', () => body({ values: undefined })],
    ['values as a list', () => body({ values: [] })],
    ['values as text', () => body({ values: 'x' })],
    ['a value that is no list', () => body({ values: { [s.level]: s.ids.Easy } })],
    ['a null value', () => body({ values: { [s.level]: null } })],
    ['a number in a value', () => body({ values: { [s.level]: [1] } })],
  ])('rejects a malformed body with 422 and writes nothing (%s)', async (_name, make) => {
    const res = await api.as(alice)('post', `/api/scenarios/${s.sid}/questions`, make())

    expect(res.status).toBe(422)
    expect(res.data.data.length).toBeGreaterThan(0)
    expect(await stored()).toEqual(empty)
  })
})

describe('reading', () => {
  it('orders the history newest first', async () => {
    const created = await create()
    const row = { question_id: created.id, user_id: alice.id }
    await api.db.insert(attempts).values([
      { ...row, id: 'a', correct: 1, answered_at: 10 },
      { ...row, id: 'c', correct: 1, answered_at: 30 },
      { ...row, id: 'b', correct: 0, answered_at: 30 },
    ])

    const res = await get(created.id)

    expect(res.data.attempts).toEqual([
      { id: 'c', correct: 1, answered_at: 30 },
      { id: 'b', correct: 0, answered_at: 30 },
      { id: 'a', correct: 1, answered_at: 10 },
    ])
    expect(res.data.stats).toMatchObject({ attemptCount: 3, correctCount: 2, lastAnsweredAt: 30 })
  })

  it("leaves out values from another scenario's options", async () => {
    const other = await createQuestionScenario(api, alice, 'Other')
    const id = await addIncomplete('JS')
    await api.db.insert(questionOptions).values({ question_id: id, option_id: other.ids.Easy! })

    const res = await get(id)

    expect(res.data.values).toEqual(s.values('JS'))
    expect(res.data.incomplete).toBe(true)
  })
})

describe('updating a question', () => {
  it('changes only what is sent, replacing the values of the attributes sent', async () => {
    const created = await create({ link: 'https://example.com', values: s.values('Easy', 'HTML', 'JS', 'EU') })
    await api.db.update(questions).set({ updated_at: 1 }).where(eq(questions.id, created.id))

    const renamed = await patch(created.id, { question: '  Renamed  ' })

    expect(renamed.status).toBe(200)
    expect(renamed.data).toEqual({ ...created, question: 'Renamed', updated_at: expect.any(Number) })
    expect(renamed.data.updated_at).toBeGreaterThanOrEqual(created.updated_at)

    const revalued = await patch(created.id, { answer: 'New', link: null, values: s.values('Hard', 'CSS') })

    expect(revalued.data).toMatchObject({ answer: 'New', link: null, values: s.values('Hard', 'CSS') })
    expect((await get(created.id)).data).toEqual({ ...revalued.data, attempts: [] })
    expect((await stored()).questionOptions).toHaveLength(2)
  })

  it('keeps the stored options of the attributes that values does not name', async () => {
    const created = await create({ values: s.values('Easy', 'HTML', 'JS', 'EU') })

    // What a client sends whose definition lacks the other attributes, required or not.
    const res = await patch(created.id, { values: { [s.level]: [s.ids.Hard!] } })

    expect(res.status, JSON.stringify(res.data)).toBe(200)
    expect(res.data.values).toEqual(s.values('Hard', 'HTML', 'JS', 'EU'))
    expect((await get(created.id)).data.values).toEqual(s.values('Hard', 'HTML', 'JS', 'EU'))
    expect((await stored()).questionOptions).toHaveLength(4)
  })

  it('clears an attribute sent with an empty list, and only that one', async () => {
    const created = await create({ values: s.values('Easy', 'JS', 'EU') })

    const res = await patch(created.id, { values: { [s.region]: [] } })

    expect(res.status, JSON.stringify(res.data)).toBe(200)
    expect(res.data.values).toEqual(s.values('Easy', 'JS'))
    expect((await stored()).questionOptions).toHaveLength(2)
  })

  it('demands the required attributes of the question as it would be stored', async () => {
    const complete = await create()
    const incomplete = await addIncomplete('Easy')
    const before = await stored()

    const emptied = await patch(complete.id, { values: { [s.topic]: [] } })
    const stillMissing = await patch(incomplete, { values: { [s.region]: [s.ids.US!] } })
    const nothing = await patch(incomplete, { values: {} })

    for (const res of [emptied, stillMissing, nothing]) {
      expect(res.status, JSON.stringify(res.data)).toBe(422)
      expect(res.data.data).toEqual([{ path: ['values', s.topic], message: 'Topic is required' }])
    }
    expect(await stored()).toEqual(before)

    const filled = await patch(incomplete, { values: { [s.topic]: [s.ids.CSS!] } })
    expect(filled.data).toMatchObject({ incomplete: false, values: s.values('Easy', 'CSS') })
  })

  it.each(['', '   ', null])('removes the link given %j', async (link) => {
    const created = await create({ link: 'https://example.com' })

    expect((await patch(created.id, { link })).data.link).toBeNull()
  })

  it('patching mastered works on an incomplete question', async () => {
    const id = await addIncomplete('Easy')

    const res = await patch(id, { mastered: 1 })

    expect(res.status).toBe(200)
    expect(res.data).toMatchObject({ mastered: 1, incomplete: true, values: s.values('Easy') })
    expect((await patch(id, { mastered: 0 })).data.mastered).toBe(0)
  })

  it('patching values requires required attributes', async () => {
    const id = await addIncomplete('Easy')
    const before = await stored()

    const res = await patch(id, { question: 'Changed', values: s.values('Hard') })

    expect(res.status).toBe(422)
    expect(res.data.data).toEqual([{ path: ['values', s.topic], message: 'Topic is required' }])
    expect(await stored()).toEqual(before)

    const fixed = await patch(id, { values: s.values('Hard', 'CSS') })
    expect(fixed.data).toMatchObject({ incomplete: false, values: s.values('Hard', 'CSS') })
  })

  it('rejects invalid values and writes nothing', async () => {
    const created = await create()
    const other = await createQuestionScenario(api, alice, 'Other')
    const before = await stored()

    for (const values of [
      s.values('Easy', 'Hard', 'JS'),
      { ...s.values('JS'), [s.level]: [other.ids.Easy!] },
    ]) {
      expect((await patch(created.id, { values })).status).toBe(422)
    }
    expect(await stored()).toEqual(before)
  })

  it.each([
    ['no body', undefined],
    ['nothing', {}],
    ['only unknown fields', { scenarioId: 'x' }],
    ['a blank question', { question: ' ' }],
    ['a blank answer', { answer: '' }],
    ['a long link', { link: 'x'.repeat(2049) }],
    ['a link that is not a web address', { link: 'javascript:alert(1)' }],
    ['mastered 2', { mastered: 2 }],
    ['mastered true', { mastered: true }],
    ['null values', { values: null }],
    ['a value that is no list', { values: { a: 'b' } }],
  ])('rejects a malformed patch with 422 (%s)', async (_name, changes) => {
    const created = await create()
    const before = await stored()

    const res = await patch(created.id, changes)

    expect(res.status).toBe(422)
    expect(await stored()).toEqual(before)
  })

  /** What the app sent before questions had scenario attributes. */
  const oldPayload = {
    question: 'Changed',
    answer_summary: 'Changed too.',
    difficulty: 'hard',
    importance: 'high',
    category: ['CSS'],
    link: 'https://example.com/changed',
  }

  it.each([
    ['the old payload', oldPayload],
    ['an unknown field beside known ones', { question: 'Changed', answer_summary: 'Changed too.' }],
  ])('writes nothing when patched with %s', async (_name, changes) => {
    const created = await create()
    const before = await stored()

    const res = await patch(created.id, changes)

    expect(res.status, JSON.stringify(res.data)).toBe(422)
    expect(await stored()).toEqual(before)
  })

  it.each([
    ['the old payload', () => oldPayload],
    ['an unknown field beside a whole question', () => body({ difficulty: 'hard' })],
  ])('creates nothing from %s', async (_name, payload) => {
    const res = await api.as(alice)('post', `/api/scenarios/${s.sid}/questions`, payload())

    expect(res.status, JSON.stringify(res.data)).toBe(422)
    expect(await stored()).toEqual(empty)
  })

  it('says there is nothing to update', async () => {
    const created = await create()

    const res = await patch(created.id, {})

    expect(res.data.data).toEqual([expect.objectContaining({ message: 'No fields to update' })])
  })
})

describe('writing atomically', () => {
  it.each(['create', 'update'])('a failed %s leaves nothing half written', async (action) => {
    const created = action === 'update' ? await create() : undefined
    const before = await stored()
    await api.db.$client.execute(
      "create trigger boom before insert on question_options begin select raise(abort, 'boom'); end",
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = created
      ? await patch(created.id, { question: 'Changed', values: s.values('Hard', 'CSS') })
      : await api.as(alice)('post', `/api/scenarios/${s.sid}/questions`, body())

    expect(res.status).toBe(500)
    expect(await stored()).toEqual(before)
  })

  /** Runs `change` between the next question write's checks and its batch. */
  function race(method: 'insert' | 'update', change: () => Promise<unknown>) {
    const batch = api.db.batch.bind(api.db)
    const write = vi.spyOn(api.db, method)
    let raced = false
    vi.spyOn(api.db, 'batch').mockImplementation((async (statements: Parameters<typeof batch>[0]) => {
      if (write.mock.calls.length && !raced) {
        raced = true
        await change()
      }
      return batch(statements)
    }) as unknown as typeof api.db.batch)
    return () => raced
  }

  const changes = {
    'turns single': () => api.db.update(attributes).set({ selection_mode: 'single' }).where(eq(attributes.id, s.topic)),
    'loses an option': () => api.db.delete(options).where(eq(options.id, s.ids.CSS!)),
  }

  it.each(Object.keys(changes) as (keyof typeof changes)[])(
    'creates nothing invalid when an attribute %s while saving',
    async (name) => {
      const raced = race('insert', changes[name])

      const res = await api.as(alice)('post', `/api/scenarios/${s.sid}/questions`, body({ values: s.values('Easy', 'CSS', 'JS') }))

      expect(raced()).toBe(true)
      expect(res.status, JSON.stringify(res.data)).toBe(422)
      expect(res.data.data).toEqual([expect.objectContaining({ path: ['values', s.topic] })])
      expect(await stored()).toEqual(empty)
    },
  )

  it.each(Object.keys(changes) as (keyof typeof changes)[])(
    'updates nothing when an attribute %s while saving',
    async (name) => {
      const created = await create()
      let before: Awaited<ReturnType<typeof stored>> | undefined
      race('update', async () => {
        await changes[name]()
        before = await stored()
      })

      const res = await patch(created.id, { values: s.values('Easy', 'CSS', 'JS') })

      expect(res.status, JSON.stringify(res.data)).toBe(422)
      expect(before).toBeDefined()
      expect(await stored()).toEqual(before)
    },
  )
})

describe('deleting and attempts', () => {
  it('delete removes attempts', async () => {
    const doomed = await create()
    const kept = await create()
    for (const questionId of [doomed.id, kept.id]) {
      await api.as(alice)('post', '/api/attempts', { questionId, correct: 1 })
    }

    const res = await api.as(alice)('delete', `/api/questions/${doomed.id}`)

    expect(res).toEqual({ status: 204, data: null })
    const left = await stored()
    expect(left.questions.map((q) => q.id)).toEqual([kept.id])
    expect(left.attempts.map((a) => a.question_id)).toEqual([kept.id])
    expect(left.questionOptions.every((row) => row.question_id === kept.id)).toBe(true)
    expect((await get(doomed.id)).status).toBe(404)
  })

  it('attempts return refreshed stats', async () => {
    const created = await create()
    const attempt = (correct: 0 | 1) => api.as(alice)('post', '/api/attempts', { questionId: created.id, correct })

    const first = await attempt(1)

    expect(first.status).toBe(200)
    expect(first.data).toEqual({
      ...created,
      stats: { attemptCount: 1, correctCount: 1, trackRecordPct: 100, lastAnsweredAt: expect.any(Number), lastCorrect: 1 },
    })
    // A later millisecond, so that "last" is unambiguous.
    await new Promise((resolve) => setTimeout(resolve, 2))
    expect((await attempt(0)).data.stats).toMatchObject({
      attemptCount: 2,
      correctCount: 1,
      trackRecordPct: 50,
      lastCorrect: 0,
    })
    expect((await stored()).attempts).toEqual([
      expect.objectContaining({ question_id: created.id, user_id: alice.id }),
      expect.objectContaining({ question_id: created.id, user_id: alice.id }),
    ])
  })

  it('records an attempt on an incomplete question', async () => {
    const id = await addIncomplete()

    const res = await api.as(alice)('post', '/api/attempts', { questionId: id, correct: 0 })

    expect(res.data).toMatchObject({ incomplete: true, stats: { attemptCount: 1, correctCount: 0 } })
  })

  it.each([
    ['no body', undefined],
    ['no question', { correct: 1 }],
    ['an empty id', { questionId: '', correct: 1 }],
    ['correct 2', { questionId: 'x', correct: 2 }],
    ['correct true', { questionId: 'x', correct: true }],
  ])('rejects an invalid attempt with 422 (%s)', async (_name, attempt) => {
    expect((await api.as(alice)('post', '/api/attempts', attempt)).status).toBe(422)
    expect((await stored()).attempts).toEqual([])
  })
})

describe('ownership', () => {
  type Target = { sid: string; id: string }
  const routes: [string, string, number, (t: Target) => [string, unknown?]][] = [
    ['get', 'question', 200, (t) => [`/api/questions/${t.id}`]],
    ['patch', 'question', 200, (t) => [`/api/questions/${t.id}`, { mastered: 1 }]],
    ['delete', 'question', 204, (t) => [`/api/questions/${t.id}`]],
    ['post', 'attempt', 200, (t) => ['/api/attempts', { questionId: t.id, correct: 1 }]],
    ['get', 'list', 200, (t) => [`/api/scenarios/${t.sid}/questions`]],
    ['get', 'ids', 200, (t) => [`/api/scenarios/${t.sid}/questions/ids`]],
    ['post', 'create', 200, (t) => [`/api/scenarios/${t.sid}/questions`, body()]],
  ]

  it.each(routes)("%s %s on another user's question or scenario is 404", async (method, _name, status, request) => {
    const { id } = await create()
    const [url, sent] = request({ sid: s.sid, id })
    const before = await stored()

    expect((await api.as(bob)(method, url, sent)).status).toBe(404)
    expect((await api.as(null)(method, url, sent)).status).toBe(401)
    expect(await stored()).toEqual(before)

    // The same request does reach the route.
    expect((await api.as(alice)(method, url, sent)).status).toBe(status)
  })

  it.each(routes)('%s %s on an unknown question or scenario is 404', async (method, _name, _status, request) => {
    const [url, sent] = request({ sid: 'nope', id: 'nope' })

    expect((await api.as(alice)(method, url, sent)).status).toBe(404)
  })
})
