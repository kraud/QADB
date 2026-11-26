import { and, asc, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attempts, attributes, options, questionOptions, questions, scenarios } from '../../db/schema'
import type { BulkAction } from '../../shared/scenario/bulk'
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

/** A question inserted directly, so that it may lack required values, with a recognisably old date. */
async function add(id: string, labels: string[], ids = s.ids, sid = s.sid): Promise<string> {
  await api.db.insert(questions).values({ id, scenario_id: sid, question: 'Q', answer: 'A', created_at: 1, updated_at: 1 })
  for (const label of labels) await api.db.insert(questionOptions).values({ question_id: id, option_id: ids[label]! })
  return id
}

/** Many questions holding Easy and HTML, inserted in bulk. */
async function addMany(amount: number): Promise<string[]> {
  const ids = Array.from({ length: amount }, (_, i) => `q${String(i).padStart(4, '0')}`)
  for (let start = 0; start < ids.length; start += 500) {
    const chunk = ids.slice(start, start + 500)
    await api.db.batch([
      api.db
        .insert(questions)
        .values(chunk.map((id) => ({ id, scenario_id: s.sid, question: 'Q', answer: 'A', created_at: 1, updated_at: 1 }))),
      api.db
        .insert(questionOptions)
        .values(chunk.flatMap((id) => [s.ids.Easy!, s.ids.HTML!].map((option_id) => ({ question_id: id, option_id })))),
    ])
  }
  return ids
}

/** Every row a bulk edit could touch, in a stable order. */
async function stored() {
  const { db } = api
  return {
    questions: await db.select().from(questions).orderBy(asc(questions.id)),
    questionOptions: await db
      .select()
      .from(questionOptions)
      .orderBy(asc(questionOptions.question_id), asc(questionOptions.option_id)),
    attempts: await db.select().from(attempts).orderBy(asc(attempts.id)),
  }
}

/** The labels each question holds, sorted. */
async function held(): Promise<Record<string, string[]>> {
  const labels = new Map((await api.db.select().from(options)).map((option) => [option.id, option.label]))
  const { questions: all, questionOptions: rows } = await stored()
  return Object.fromEntries(
    all.map((q) => [
      q.id,
      rows.filter((row) => row.question_id === q.id).map((row) => labels.get(row.option_id)!).sort(),
    ]),
  )
}

/** The ids of the questions whose `updated_at` moved. */
const touched = async () => (await stored()).questions.filter((q) => q.updated_at !== 1).map((q) => q.id)

interface Edit {
  questionIds: string[]
  attributeId: string
  action: BulkAction
  optionIds: string[]
}

const url = (sid = s.sid) => `/api/scenarios/${sid}/questions/bulk`
const bulk = (edit: Edit, user = alice, sid = s.sid) => api.as(user)('patch', url(sid), edit)

const edit = (questionIds: string[], attributeId: string, action: BulkAction, ...labels: string[]): Edit => ({
  questionIds,
  attributeId,
  action,
  optionIds: labels.map((label) => s.ids[label]!),
})

describe('bulk editing', () => {
  const cases: Record<BulkAction, { attribute: 'level' | 'topic' | 'region'; chosen: string[]; start: string[][]; end: string[][] }> = {
    set: {
      attribute: 'level',
      chosen: ['Hard'],
      start: [['Easy'], ['Hard'], []],
      end: [['Hard'], ['Hard'], ['Hard']],
    },
    clear: {
      attribute: 'region',
      chosen: [],
      start: [['EU'], [], ['US']],
      end: [[], [], []],
    },
    add: {
      attribute: 'topic',
      chosen: ['CSS', 'JS'],
      start: [['HTML'], ['CSS', 'JS'], ['JS']],
      end: [['CSS', 'HTML', 'JS'], ['CSS', 'JS'], ['CSS', 'JS']],
    },
    replace: {
      attribute: 'topic',
      chosen: ['CSS', 'JS'],
      start: [['HTML', 'JS'], ['CSS', 'JS'], []],
      end: [['CSS', 'JS'], ['CSS', 'JS'], ['CSS', 'JS']],
    },
    remove: {
      attribute: 'topic',
      chosen: ['CSS', 'JS'],
      start: [['CSS', 'HTML', 'JS'], ['HTML'], ['HTML', 'JS']],
      end: [['HTML'], ['HTML'], ['HTML']],
    },
  }
  const changed: Record<BulkAction, string[]> = {
    set: ['q1', 'q3'],
    clear: ['q1', 'q3'],
    add: ['q1', 'q3'],
    replace: ['q1', 'q3'],
    remove: ['q1', 'q3'],
  }

  it.each(['set', 'clear', 'add', 'replace', 'remove'] as const)(
    'applies %s and bumps updated_at only on changed questions',
    async (action) => {
      const { attribute, chosen, start, end } = cases[action]
      const ids = ['q1', 'q2', 'q3']
      for (const [i, id] of ids.entries()) await add(id, start[i]!)
      // Not selected: must stay as it is.
      await add('other', start[0]!)
      const before = Date.now()

      const res = await bulk(edit(ids, s[attribute], action, ...chosen))

      expect(res.status, JSON.stringify(res.data)).toBe(200)
      expect(res.data).toEqual({ updated: changed[action].length })
      expect(await held()).toEqual({ q1: end[0], q2: end[1], q3: end[2], other: [...start[0]!].sort() })
      expect(await touched()).toEqual(changed[action])
      for (const q of (await stored()).questions.filter((q) => changed[action].includes(q.id))) {
        expect(q.updated_at).toBeGreaterThanOrEqual(before)
      }
    },
  )

  it('ignores options sent with clear', async () => {
    await add('q1', ['EU'])

    const res = await bulk(edit(['q1'], s.region, 'clear', 'EU'))

    expect(res.data).toEqual({ updated: 1 })
    expect(await held()).toEqual({ q1: [] })
  })

  it('counts a question and an option listed twice once', async () => {
    await add('q1', ['HTML'])
    await add('q2', ['HTML'])

    const res = await bulk(edit(['q1', 'q2', 'q1', 'q1'], s.topic, 'add', 'JS', 'JS'))

    expect(res.status, JSON.stringify(res.data)).toBe(200)
    expect(res.data).toEqual({ updated: 2 })
    expect(await held()).toEqual({ q1: ['HTML', 'JS'], q2: ['HTML', 'JS'] })
  })

  it('succeeds without writing when nothing would change', async () => {
    await add('q1', ['Easy'])
    const before = await stored()

    const res = await bulk(edit(['q1'], s.level, 'set', 'Easy'))

    expect(res.data).toEqual({ updated: 0 })
    expect(await stored()).toEqual(before)
  })

  it('leaves other attributes, mastered and attempts untouched', async () => {
    await add('q1', ['Easy', 'HTML', 'CSS', 'EU'])
    await api.db.update(questions).set({ mastered: 1, link: 'https://example.com' }).where(eq(questions.id, 'q1'))
    await api.db.insert(attempts).values({ id: 't', question_id: 'q1', user_id: alice.id, correct: 1, answered_at: 5 })
    const before = await stored()

    const res = await bulk(edit(['q1'], s.topic, 'replace', 'JS'))

    expect(res.data).toEqual({ updated: 1 })
    expect(await held()).toEqual({ q1: ['EU', 'Easy', 'JS'] })
    const after = await stored()
    expect(after.attempts).toEqual(before.attempts)
    expect(after.questions).toEqual([{ ...before.questions[0], updated_at: expect.any(Number) }])
  })

  it('fixes incomplete questions, leaving their other gaps alone', async () => {
    await add('q1', [])

    const res = await bulk(edit(['q1'], s.level, 'set', 'Easy'))

    expect(res.data).toEqual({ updated: 1 })
    expect(await held()).toEqual({ q1: ['Easy'] })
  })
})

describe('rejections', () => {
  it.each([
    ['removing the last options', 'remove' as const],
    ['clearing', 'clear' as const],
  ])('rejects emptying a required attribute, changing nothing, with the count (%s)', async (_name, action) => {
    await add('q1', ['Easy', 'CSS'])
    await add('q2', ['Easy', 'CSS', 'JS'])
    await add('q3', ['Easy', 'CSS'])
    const before = await stored()
    const ids = ['q1', 'q2', 'q3', 'q1']

    const res = await bulk(
      action === 'clear' ? edit(ids, s.level, 'clear') : edit(ids, s.topic, 'remove', 'CSS'),
    )

    expect(res.status).toBe(422)
    expect(res.data.data).toEqual({ reason: 'would-empty', count: action === 'clear' ? 3 : 2 })
    expect(await stored()).toEqual(before)
  })

  it('rejects a question, attribute or option from another scenario, changing nothing', async () => {
    const other = await createQuestionScenario(api, alice, 'Other')
    const theirs = await createQuestionScenario(api, bob, 'Theirs')
    await add('mine', ['Easy', 'HTML'])
    await add('elsewhere', ['Easy', 'HTML'], other.ids, other.sid)
    await add('bobs', ['Easy', 'HTML'], theirs.ids, theirs.sid)
    const before = await stored()
    const valid = edit(['mine'], s.level, 'set', 'Hard')
    const cases: [string, Edit][] = [
      ['a question of another scenario', { ...valid, questionIds: ['mine', 'elsewhere'] }],
      ['a question of another user', { ...valid, questionIds: ['mine', 'bobs'] }],
      ['an unknown question', { ...valid, questionIds: ['mine', 'nope'] }],
      ['an attribute of another scenario', { ...valid, attributeId: other.level, optionIds: [other.ids.Hard!] }],
      ['an attribute of another user', { ...valid, attributeId: theirs.level, optionIds: [theirs.ids.Hard!] }],
      ['an unknown attribute', { ...valid, attributeId: 'toString' }],
      ['an option of another scenario', { ...valid, optionIds: [other.ids.Hard!] }],
      ['an option of another user', { ...valid, optionIds: [theirs.ids.Hard!] }],
      ['an option of another attribute', { ...valid, optionIds: [s.ids.JS!] }],
      ['one foreign option among own ones', edit(['mine'], s.topic, 'add', 'JS', 'Hard')],
      ['no option to set', { ...valid, optionIds: [] }],
      ['two options to set', edit(['mine'], s.level, 'set', 'Easy', 'Hard')],
      ['an action of the other mode', edit(['mine'], s.level, 'add', 'Hard')],
    ]

    for (const [name, body] of cases) {
      const res = await bulk(body)

      expect(res.status, name).toBe(422)
      expect(res.data.data, name).toEqual({ reason: 'invalid', count: 0 })
    }
    expect(await stored()).toEqual(before)

    expect((await bulk(valid)).data).toEqual({ updated: 1 })
  })

  it("answers 404 for another user's or an unknown scenario, and 401 when signed out", async () => {
    await add('q1', ['Easy', 'HTML'])
    const before = await stored()
    const body = edit(['q1'], s.level, 'set', 'Hard')

    expect((await bulk(body, bob)).status).toBe(404)
    // Nothing is said about what the body would have done.
    expect((await bulk(edit(['q1'], s.level, 'clear'), bob)).status).toBe(404)
    expect((await bulk(body, alice, 'nope')).status).toBe(404)
    expect((await api.as(null)('patch', url(), body)).status).toBe(401)
    expect(await stored()).toEqual(before)

    expect((await bulk(body)).data).toEqual({ updated: 1 })
  })

  const valid = () => edit(['q1'], s.level, 'set', 'Hard')

  it.each<[string, () => unknown]>([
    ['no body', () => undefined],
    ['a list', () => []],
    ['no question ids', () => ({ ...valid(), questionIds: undefined })],
    ['an empty selection', () => ({ ...valid(), questionIds: [] })],
    ['2001 ids', () => ({ ...valid(), questionIds: Array.from({ length: 2001 }, () => 'q1') })],
    ['ids as text', () => ({ ...valid(), questionIds: 'q1' })],
    ['a number as id', () => ({ ...valid(), questionIds: [1] })],
    ['no attribute', () => ({ ...valid(), attributeId: undefined })],
    ['an unknown action', () => ({ ...valid(), action: 'toString' })],
    ['no options', () => ({ ...valid(), optionIds: undefined })],
    ['options as text', () => ({ ...valid(), optionIds: 'x' })],
    ['a null option', () => ({ ...valid(), optionIds: [null] })],
  ])('rejects a malformed body with 422 and writes nothing (%s)', async (_name, make) => {
    await add('q1', ['Easy', 'HTML'])
    const before = await stored()

    const res = await api.as(alice)('patch', url(), make())

    expect(res.status).toBe(422)
    expect(res.data.data.length).toBeGreaterThan(0)
    expect(await stored()).toEqual(before)
  })
})

describe('large selections', () => {
  it('handles 1000 questions in one atomic request', async () => {
    const ids = await addMany(1000)
    const before = await stored()
    // The last question refuses the change, so none of the others may keep it.
    await api.db.$client.execute(
      `create trigger boom before insert on question_options when new.question_id = 'q0999' begin select raise(abort, 'boom'); end`,
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect((await bulk(edit(ids, s.topic, 'replace', 'JS'))).status).toBe(500)
    expect(await stored()).toEqual(before)

    await api.db.$client.execute('drop trigger boom')
    const batch = vi.spyOn(api.db.$client, 'batch')

    const res = await bulk(edit(ids, s.topic, 'replace', 'JS'))

    expect(res.data).toEqual({ updated: 1000 })
    // Reading the definition, reading the values, writing.
    expect(batch).toHaveBeenCalledTimes(3)
    expect(Object.values(await held())).toEqual(ids.map(() => ['Easy', 'JS']))
    expect(await touched()).toEqual(ids)
  })

  it('handles the largest selection', async () => {
    const ids = await addMany(2000)

    const rejected = await bulk(edit(ids, s.topic, 'remove', 'HTML'))

    expect(rejected.data.data).toEqual({ reason: 'would-empty', count: 2000 })
    expect((await bulk(edit(ids, s.topic, 'add', 'CSS', 'JS'))).data).toEqual({ updated: 2000 })
    expect((await bulk(edit(ids, s.topic, 'remove', 'CSS', 'JS'))).data).toEqual({ updated: 2000 })
    expect((await stored()).questionOptions).toHaveLength(4000)
  })
})

describe('changes made while saving', () => {
  /** Runs `change` between the bulk edit's checks and its write, and records what it left. */
  function race(change: () => Promise<unknown>) {
    const batch = api.db.batch.bind(api.db)
    const write = vi.spyOn(api.db, 'update')
    const result: { left?: Awaited<ReturnType<typeof stored>> } = {}
    let raced = false
    vi.spyOn(api.db, 'batch').mockImplementation((async (statements: Parameters<typeof batch>[0]) => {
      if (write.mock.calls.length && !raced) {
        raced = true
        // The change itself may use `update`.
        await change()
        result.left = await stored()
      }
      return batch(statements)
    }) as typeof api.db.batch)
    return result
  }

  const attribute = (id: string) => eq(attributes.id, id)
  const value = (id: string, label: string) =>
    and(eq(questionOptions.question_id, id), eq(questionOptions.option_id, s.ids[label]!))
  const invalid = { reason: 'invalid', count: 0 }

  it.each<[string, () => Edit, () => Promise<unknown>, object]>([
    [
      'the attribute turns single',
      () => edit(['q1', 'q2'], s.topic, 'add', 'JS'),
      () => api.db.update(attributes).set({ selection_mode: 'single' }).where(attribute(s.topic)),
      invalid,
    ],
    [
      'the attribute turns multiple',
      () => edit(['q1', 'q2'], s.level, 'set', 'Hard'),
      () => api.db.update(attributes).set({ selection_mode: 'multiple' }).where(attribute(s.level)),
      invalid,
    ],
    [
      'the attribute becomes required',
      () => edit(['q1', 'q2'], s.region, 'clear'),
      () => api.db.update(attributes).set({ required: true }).where(attribute(s.region)),
      { reason: 'would-empty', count: 2 },
    ],
    [
      'the attribute goes',
      () => edit(['q1', 'q2'], s.region, 'clear'),
      () => api.db.delete(attributes).where(attribute(s.region)),
      invalid,
    ],
    [
      'a chosen option goes',
      () => edit(['q1', 'q2'], s.topic, 'replace', 'CSS', 'JS'),
      () => api.db.delete(options).where(eq(options.id, s.ids.CSS!)),
      invalid,
    ],
    [
      'an option to remove goes',
      () => edit(['q1', 'q2'], s.topic, 'remove', 'CSS'),
      () => api.db.delete(options).where(eq(options.id, s.ids.CSS!)),
      invalid,
    ],
    [
      'a question goes',
      () => edit(['q1', 'q2'], s.level, 'set', 'Hard'),
      () => api.db.delete(questions).where(eq(questions.id, 'q2')),
      invalid,
    ],
    [
      'a question loses what would have stayed',
      () => edit(['q1', 'q2'], s.topic, 'remove', 'CSS'),
      () => api.db.delete(questionOptions).where(value('q2', 'HTML')),
      { reason: 'would-empty', count: 1 },
    ],
  ])('changes nothing when %s', async (_name, make, change, data) => {
    await add('q1', ['Easy', 'HTML', 'CSS', 'EU'])
    await add('q2', ['Easy', 'HTML', 'CSS', 'EU'])
    const result = race(change)

    const res = await bulk(make())

    expect(res.status, JSON.stringify(res.data)).toBe(422)
    expect(res.data.data).toEqual(data)
    expect(await stored()).toEqual(result.left)
  })

  it('answers 404 when the scenario goes', async () => {
    await add('q1', ['Easy', 'HTML'])
    race(() => api.db.delete(scenarios).where(eq(scenarios.id, s.sid)))

    expect((await bulk(edit(['q1'], s.level, 'set', 'Hard'))).status).toBe(404)
  })

  it('applies the action to what a question holds by then', async () => {
    await add('q1', ['Easy', 'HTML'])
    // Already as wanted when checked, changed before the write.
    await add('q2', ['Easy', 'JS'])
    race(async () => {
      await api.db.insert(questionOptions).values({ question_id: 'q1', option_id: s.ids.CSS! })
      await api.db.delete(questionOptions).where(value('q2', 'JS'))
    })

    const res = await bulk(edit(['q1', 'q2'], s.topic, 'add', 'JS'))

    expect(res.data).toEqual({ updated: 2 })
    expect(await held()).toEqual({ q1: ['CSS', 'Easy', 'HTML', 'JS'], q2: ['Easy', 'JS'] })
    expect(await touched()).toEqual(['q1', 'q2'])
  })
})
