import { createId } from '@paralleldrive/cuid2'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attempts, attributes, options, questionOptions, questions, scenarios } from '../../db/schema'
import type { AuthUser } from '../../server/utils/auth'
import type { ScenarioInput } from '../../shared/scenario/schema'
import type { Scenario } from '../../shared/scenario/types'
import { createApiTest, type ApiTest } from '../support/api-app'

let api: ApiTest
let alice: AuthUser
let bob: AuthUser

beforeEach(async () => {
  api = await createApiTest()
  alice = await api.createUser('alice')
  bob = await api.createUser('bob')
})

afterEach(async () => {
  vi.restoreAllMocks()
  await api.close()
})

const option = (label: string, extra: object = {}) => ({ label, color: 'green' as const, isDefault: false, ...extra })

/** A required ordered attribute, a multiple one and an optional one. */
function input(name = 'Finance'): ScenarioInput {
  return {
    name,
    attributes: [
      {
        name: 'Level',
        selectionMode: 'single',
        ordered: true,
        required: true,
        options: [option('Low'), option('Mid'), option('High', { isDefault: true })],
      },
      {
        name: 'Tags',
        selectionMode: 'multiple',
        ordered: false,
        required: true,
        options: [option('Tax'), option('Loans'), option('Funds')],
      },
      { name: 'Region', selectionMode: 'single', ordered: false, required: false, options: [option('EU'), option('US')] },
    ],
  }
}

async function create(user: AuthUser, body: ScenarioInput = input()): Promise<Scenario> {
  const res = await api.as(user)('post', '/api/scenarios', body)
  expect(res.status, JSON.stringify(res.data)).toBe(200)
  return res.data
}

/** The saved scenario as the editor sends it back, unchanged. */
function payload(scenario: Scenario): ScenarioInput {
  return {
    name: scenario.name,
    attributes: scenario.attributes.map(({ position: _, options, ...attribute }) => ({
      ...attribute,
      options: options.map(({ position: _position, ...rest }) => rest),
    })),
  }
}

type AttributeInput = ScenarioInput['attributes'][number]

/** The named attribute of a payload. */
const attr = (body: ScenarioInput, name: string): AttributeInput => body.attributes.find((a) => a.name === name)!

/** Takes these options out of a payload. */
function remove(body: ScenarioInput, ...labels: string[]) {
  for (const a of body.attributes) a.options = a.options.filter((o) => !labels.includes(o.label))
}

function put(user: AuthUser | null, sid: string, scenario: ScenarioInput, resolutions?: object) {
  return api.as(user)('put', `/api/scenarios/${sid}`, { scenario, resolutions })
}

/** A save that must succeed. */
async function save(scenario: Scenario, body: ScenarioInput, resolutions: object = {}): Promise<Scenario> {
  const res = await put(alice, scenario.id, body, resolutions)
  expect(res.status, JSON.stringify(res.data)).toBe(200)
  return res.data
}

/** Option ids by label. */
function ids(scenario: Scenario): Record<string, string> {
  return Object.fromEntries(scenario.attributes.flatMap((a) => a.options.map((o) => [o.label, o.id])))
}

/** Question routes do not exist yet, so rows go straight into the database. `updated_at` starts at 1. */
async function addQuestion(scenario: Scenario, ...labels: string[]): Promise<string> {
  const id = createId()
  await api.db.insert(questions).values({ id, scenario_id: scenario.id, question: 'Q', answer: 'A', updated_at: 1 })
  for (const label of labels) {
    await api.db.insert(questionOptions).values({ question_id: id, option_id: ids(scenario)[label]! })
  }
  await api.db.insert(attempts).values({ id: createId(), question_id: id, user_id: alice.id, correct: 1 })
  return id
}

/** The labels a question holds, in attribute and option order. */
async function labelsOf(questionId: string): Promise<string[]> {
  const rows = await api.db
    .select({ label: options.label })
    .from(questionOptions)
    .innerJoin(options, eq(options.id, questionOptions.option_id))
    .innerJoin(attributes, eq(attributes.id, options.attribute_id))
    .where(eq(questionOptions.question_id, questionId))
    .orderBy(attributes.position, options.position)
  return rows.map((row) => row.label)
}

async function touched(questionId: string): Promise<boolean> {
  const [row] = await api.db.select().from(questions).where(eq(questions.id, questionId))
  return row!.updated_at !== 1
}

async function counts(scenario: Scenario): Promise<{ questionCount: number; incompleteCount: number }> {
  const res = await api.as(alice)('get', `/api/scenarios/${scenario.id}`)
  const { questionCount, incompleteCount } = res.data
  return { questionCount, incompleteCount }
}

/** Every row of every table a scenario write can touch. */
async function stored() {
  const { db } = api
  return {
    scenarios: await db.select().from(scenarios),
    attributes: await db.select().from(attributes),
    options: await db.select().from(options),
    questions: await db.select().from(questions),
    questionOptions: await db.select().from(questionOptions),
    attempts: await db.select().from(attempts),
  }
}

describe('applied directly', () => {
  it('rename, recolor, reorder and add apply with no resolutions and keep question values', async () => {
    const scenario = await create(alice)
    const question = await addQuestion(scenario, 'Low', 'Tax', 'Loans', 'EU')
    const before = await stored()

    const body = payload(scenario)
    body.name = 'Money'
    attr(body, 'Level').options[0] = { ...attr(body, 'Level').options[0]!, label: 'Basic', color: 'pink' }
    attr(body, 'Tags').name = 'Topics'
    attr(body, 'Topics').options.reverse()
    attr(body, 'Topics').options.unshift(option('Bonds', { isDefault: true }))
    body.attributes.reverse()
    body.attributes.push({
      name: 'Source',
      selectionMode: 'single',
      ordered: false,
      required: false,
      options: [option('Book'), option('Web')],
    })

    // A resolutions object is not needed at all.
    const res = await api.as(alice)('put', `/api/scenarios/${scenario.id}`, { scenario: body })

    expect(res.status, JSON.stringify(res.data)).toBe(200)
    const id = expect.any(String)
    expect(res.data).toEqual({
      id: scenario.id,
      name: 'Money',
      attributes: body.attributes.map((a, position) => ({
        ...a,
        id: a.id ?? id,
        position,
        options: a.options.map((o, optionPosition) => ({ ...o, id: o.id ?? id, position: optionPosition })),
      })),
    })
    expect((await api.as(alice)('get', `/api/scenarios/${scenario.id}`)).data).toMatchObject(res.data)
    expect(await labelsOf(question)).toEqual(['EU', 'Loans', 'Tax', 'Basic'])
    const after = await stored()
    expect(after.questions).toEqual(before.questions)
    expect(after.questionOptions).toEqual(before.questionOptions)
    expect(after.attempts).toEqual(before.attempts)
    expect(after.scenarios[0]!.updated_at).toBeGreaterThanOrEqual(before.scenarios[0]!.updated_at)
  })

  it('keeps its own name, in another case too', async () => {
    const scenario = await create(alice)

    expect((await save(scenario, { ...payload(scenario), name: 'FINANCE' })).name).toBe('FINANCE')
  })

  it('a new required attribute leaves questions incomplete', async () => {
    const scenario = await create(alice)
    const question = await addQuestion(scenario, 'Low', 'Tax')
    expect(await counts(scenario)).toEqual({ questionCount: 1, incompleteCount: 0 })

    const body = payload(scenario)
    body.attributes.push({
      name: 'Source',
      selectionMode: 'single',
      ordered: false,
      required: true,
      options: [option('Book', { isDefault: true }), option('Web')],
    })
    await save(scenario, body)

    // Defaults are for new questions only.
    expect(await labelsOf(question)).toEqual(['Low', 'Tax'])
    expect(await counts(scenario)).toEqual({ questionCount: 1, incompleteCount: 1 })
    expect(await touched(question)).toBe(false)
  })

  it('turning required on does the same', async () => {
    const scenario = await create(alice)
    const question = await addQuestion(scenario, 'Low', 'Tax')
    await addQuestion(scenario, 'Low', 'Tax', 'EU')

    const body = payload(scenario)
    attr(body, 'Region').required = true
    await save(scenario, body)

    expect(await labelsOf(question)).toEqual(['Low', 'Tax'])
    expect(await counts(scenario)).toEqual({ questionCount: 2, incompleteCount: 1 })
    expect(await touched(question)).toBe(false)
  })

  it('single to multiple keeps values', async () => {
    const scenario = await create(alice)
    const question = await addQuestion(scenario, 'Mid', 'Tax')
    const before = await stored()

    const body = payload(scenario)
    Object.assign(attr(body, 'Level'), { selectionMode: 'multiple', ordered: false })
    const saved = await save(scenario, body)

    expect(saved.attributes[0]).toMatchObject({ selectionMode: 'multiple', ordered: false })
    expect((await stored()).questionOptions).toEqual(before.questionOptions)
    expect(await touched(question)).toBe(false)
  })
})

describe('deleting options', () => {
  it('deleting an unused option needs nothing', async () => {
    const scenario = await create(alice)
    const question = await addQuestion(scenario, 'Low', 'Tax')

    const body = payload(scenario)
    remove(body, 'High', 'Funds')
    const saved = await save(scenario, body)

    expect(Object.keys(ids(saved))).toEqual(['Low', 'Mid', 'Tax', 'Loans', 'EU', 'US'])
    expect((await stored()).options).toHaveLength(6)
    expect(await labelsOf(question)).toEqual(['Low', 'Tax'])
    expect(await touched(question)).toBe(false)
  })

  it('deleting a used option returns 409 with the count', async () => {
    const scenario = await create(alice)
    await addQuestion(scenario, 'Low', 'Tax')
    await addQuestion(scenario, 'Low', 'Tax', 'Loans')
    const before = await stored()
    const [level, tags] = scenario.attributes

    const body = payload(scenario)
    body.name = 'Money'
    remove(body, 'Low', 'Loans', 'Funds')
    attr(body, 'Tags').options.push(option('Bonds'))
    const res = await put(alice, scenario.id, body)

    expect(res.status).toBe(409)
    expect(res.data.data).toEqual({
      conflicts: [
        { type: 'option-in-use', attributeId: level!.id, optionId: ids(scenario).Low, count: 2 },
        { type: 'option-in-use', attributeId: tags!.id, optionId: ids(scenario).Loans, count: 1 },
      ],
    })
    expect(await stored()).toEqual(before)
  })

  it('moveTo an existing option, to a new option by ref, and null', async () => {
    const scenario = await create(alice)
    const first = await addQuestion(scenario, 'Low', 'Tax', 'EU')
    const second = await addQuestion(scenario, 'Mid', 'Loans', 'US')
    const untouched = await addQuestion(scenario, 'High', 'Funds')

    const body = payload(scenario)
    remove(body, 'Low', 'Loans', 'EU')
    attr(body, 'Tags').options.push(option('Debt', { ref: 'new-debt' }))
    attr(body, 'Region').options.push(option('Asia'))
    const saved = await save(scenario, body, {
      removedOptions: {
        [ids(scenario).Low!]: { moveTo: ids(scenario).Mid },
        [ids(scenario).Loans!]: { moveTo: 'new-debt' },
        [ids(scenario).EU!]: { moveTo: null },
      },
    })

    expect(await labelsOf(first)).toEqual(['Mid', 'Tax'])
    expect(await labelsOf(second)).toEqual(['Mid', 'Debt', 'US'])
    expect(await labelsOf(untouched)).toEqual(['High', 'Funds'])
    expect(Object.keys(ids(saved))).toEqual(['Mid', 'High', 'Tax', 'Funds', 'Debt', 'US', 'Asia'])
    expect([await touched(first), await touched(second), await touched(untouched)]).toEqual([true, true, false])
    expect((await stored()).attempts).toHaveLength(3)
  })

  it('move never duplicates in multiple mode', async () => {
    const scenario = await create(alice)
    const both = await addQuestion(scenario, 'Low', 'Tax', 'Loans')
    const two = await addQuestion(scenario, 'Low', 'Loans', 'Funds')
    const one = await addQuestion(scenario, 'Low', 'Funds')

    const body = payload(scenario)
    remove(body, 'Loans', 'Funds')
    attr(body, 'Tags').options.push(option('Debt'))
    await save(scenario, body, {
      removedOptions: {
        [ids(scenario).Loans!]: { moveTo: ids(scenario).Tax },
        [ids(scenario).Funds!]: { moveTo: ids(scenario).Tax },
      },
    })

    for (const question of [both, two, one]) {
      expect(await labelsOf(question)).toEqual(['Low', 'Tax'])
      expect(await touched(question)).toBe(true)
    }
    expect((await stored()).questionOptions).toHaveLength(6)
  })

  it.each([
    ['the removed option itself', (s: Scenario) => ids(s).Low!],
    ['another removed option', (s: Scenario) => ids(s).Mid!],
    ['an option of another attribute', (s: Scenario) => ids(s).Tax!],
    ['a new option of another attribute', () => 'other-attribute'],
    ['an option of another scenario', (_s: Scenario, other: Scenario) => ids(other).High!],
    ['an unknown ref', () => 'nothing'],
  ])('rejects moveTo that is removed, in another attribute, or in another scenario (%s)', async (_name, target) => {
    const scenario = await create(alice)
    const other = await create(alice, input('Other'))
    await addQuestion(scenario, 'Low', 'Tax')
    const before = await stored()

    const body = payload(scenario)
    remove(body, 'Low', 'Mid')
    attr(body, 'Level').options.push(option('Top'))
    attr(body, 'Tags').options.push(option('Debt', { ref: 'other-attribute' }))
    const res = await put(alice, scenario.id, body, {
      removedOptions: { [ids(scenario).Low!]: { moveTo: target(scenario, other) } },
    })

    expect(res.status, JSON.stringify(res.data)).toBe(422)
    expect(res.data.data).toEqual([
      expect.objectContaining({ path: ['resolutions', 'removedOptions', ids(scenario).Low, 'moveTo'] }),
    ])
    expect(await stored()).toEqual(before)
  })

  it.each([1, 0])('rejects dropping to %s options', async (left) => {
    const scenario = await create(alice)
    await addQuestion(scenario, 'EU')
    const before = await stored()

    const body = payload(scenario)
    attr(body, 'Region').options.splice(left)
    const res = await put(alice, scenario.id, body, { removedOptions: { [ids(scenario).US!]: { moveTo: null } } })

    expect(res.status).toBe(422)
    expect(res.data.data).toEqual([expect.objectContaining({ path: ['scenario', 'attributes', 2, 'options'] })])
    expect(await stored()).toEqual(before)
  })
})

describe('deleting attributes', () => {
  it('deleting a used attribute needs confirmation and keeps the questions', async () => {
    const scenario = await create(alice)
    const tagged = await addQuestion(scenario, 'Low', 'Tax', 'Loans')
    const other = await addQuestion(scenario, 'Mid')
    const before = await stored()
    const tags = scenario.attributes[1]!

    const body = payload(scenario)
    body.attributes.splice(1, 1)
    // Settling the options one by one does not confirm losing the attribute.
    const refused = await put(alice, scenario.id, body, {
      removedOptions: { [ids(scenario).Tax!]: { moveTo: null }, [ids(scenario).Loans!]: { moveTo: null } },
    })

    expect(refused.status).toBe(409)
    expect(refused.data.data).toEqual({ conflicts: [{ type: 'attribute-delete', attributeId: tags.id, count: 1 }] })
    expect(await stored()).toEqual(before)

    const saved = await save(scenario, body, { removedAttributes: [tags.id] })

    expect(saved.attributes.map((a) => [a.name, a.position])).toEqual([['Level', 0], ['Region', 1]])
    expect(await labelsOf(tagged)).toEqual(['Low'])
    expect(await labelsOf(other)).toEqual(['Mid'])
    expect([await touched(tagged), await touched(other)]).toEqual([true, false])
    const after = await stored()
    expect(after.attributes).toHaveLength(2)
    expect(after.options).toHaveLength(5)
    expect(after.questions).toHaveLength(2)
    expect(after.attempts).toEqual(before.attempts)
  })

  it('deleting an unused attribute needs nothing, even all of them', async () => {
    const scenario = await create(alice)
    const question = await addQuestion(scenario)

    const saved = await save(scenario, { name: 'Finance', attributes: [] })

    expect(saved.attributes).toEqual([])
    expect((await stored()).options).toEqual([])
    expect(await touched(question)).toBe(false)
  })
})

describe('multiple to single', () => {
  it('multiple to single needs confirmation and keeps the first by new order', async () => {
    const scenario = await create(alice)
    const all = await addQuestion(scenario, 'Low', 'Tax', 'Loans', 'Funds', 'EU')
    const two = await addQuestion(scenario, 'Mid', 'Tax', 'Loans')
    const one = await addQuestion(scenario, 'High', 'Tax')
    const none = await addQuestion(scenario, 'High')
    const before = await stored()
    const tags = scenario.attributes[1]!

    const body = payload(scenario)
    attr(body, 'Tags').selectionMode = 'single'
    attr(body, 'Tags').options.reverse() // Funds, Loans, Tax
    const refused = await put(alice, scenario.id, body)

    expect(refused.status).toBe(409)
    expect(refused.data.data).toEqual({ conflicts: [{ type: 'multiple-to-single', attributeId: tags.id, count: 2 }] })
    expect(await stored()).toEqual(before)

    await save(scenario, body, { collapseToSingle: [tags.id] })

    expect(await labelsOf(all)).toEqual(['Low', 'Funds', 'EU'])
    expect(await labelsOf(two)).toEqual(['Mid', 'Loans'])
    expect(await labelsOf(one)).toEqual(['High', 'Tax'])
    expect(await labelsOf(none)).toEqual(['High'])
    expect([await touched(all), await touched(two), await touched(one), await touched(none)]).toEqual([
      true,
      true,
      false,
      false,
    ])
  })

  it('collapses after moves and removals, to a new option placed first', async () => {
    const scenario = await create(alice)
    const moved = await addQuestion(scenario, 'Tax', 'Loans')
    const dropped = await addQuestion(scenario, 'Loans', 'Funds')
    const tags = scenario.attributes[1]!

    const body = payload(scenario)
    remove(body, 'Tax', 'Funds')
    attr(body, 'Tags').selectionMode = 'single'
    attr(body, 'Tags').options.unshift(option('Debt', { ref: 'debt' }))
    await save(scenario, body, {
      removedOptions: { [ids(scenario).Tax!]: { moveTo: 'debt' }, [ids(scenario).Funds!]: { moveTo: null } },
      collapseToSingle: [tags.id],
    })

    expect(await labelsOf(moved)).toEqual(['Debt'])
    expect(await labelsOf(dropped)).toEqual(['Loans'])
  })

  it('needs nothing when no question holds several options', async () => {
    const scenario = await create(alice)
    const question = await addQuestion(scenario, 'Tax')

    const body = payload(scenario)
    attr(body, 'Tags').selectionMode = 'single'
    await save(scenario, body)

    expect(await labelsOf(question)).toEqual(['Tax'])
    expect(await touched(question)).toBe(false)
  })
})

describe('rejected payloads', () => {
  it.each<[string, (body: ScenarioInput, scenario: Scenario, other: Scenario) => object | void]>([
    ['an attribute id of another scenario', (body, _s, other) => void (body.attributes[2]!.id = other.attributes[2]!.id)],
    ['an option id of another scenario', (body, _s, other) => void (body.attributes[2]!.options[0]!.id = ids(other).EU)],
    ['an unknown attribute id', (body) => void (body.attributes[0]!.id = 'nope')],
    ['an unknown option id', (body) => void (body.attributes[0]!.options[0]!.id = 'nope')],
    [
      'an option id moved under another attribute',
      (body) => {
        const [moved] = attr(body, 'Level').options.splice(0, 1)
        attr(body, 'Region').options.push(moved!)
      },
    ],
    [
      'an option id under a new attribute',
      (body) => {
        const [moved] = attr(body, 'Level').options.splice(0, 1)
        body.attributes.push({ name: 'New', selectionMode: 'single', ordered: false, required: false, options: [moved!, option('x')] })
      },
    ],
    ['a repeated attribute id', (body) => void body.attributes.push({ ...body.attributes[2]!, name: 'Again', options: [option('x'), option('y')] })],
    ['a repeated option id', (body) => void attr(body, 'Level').options.push({ ...attr(body, 'Level').options[0]!, label: 'Again' })],
    [
      'a repeated option ref',
      (body) => {
        attr(body, 'Level').options.push(option('x', { ref: 'r' }))
        attr(body, 'Tags').options.push(option('y', { ref: 'r' }))
      },
    ],
    ['a ref that is an existing option id', (body, s) => void attr(body, 'Level').options.push(option('x', { ref: ids(s).Mid }))],
    ['a resolution for a foreign option', (_b, _s, other) => ({ removedOptions: { [ids(other).Low!]: { moveTo: null } } })],
    ['a foreign removed attribute', (_b, _s, other) => ({ removedAttributes: [other.attributes[0]!.id] })],
    ['a foreign collapsed attribute', (_b, _s, other) => ({ collapseToSingle: [other.attributes[1]!.id] })],
    ['a resolution without moveTo', (_b, s) => ({ removedOptions: { [ids(s).Low!]: {} } })],
    ['a blank name', (body) => void (body.name = ' ')],
  ])('rejects attribute or option ids from another scenario, writing nothing: %s', async (_name, change) => {
    const scenario = await create(alice)
    const other = await create(alice, input('Other'))
    await addQuestion(scenario, 'Low', 'Tax', 'EU')
    await addQuestion(other, 'Low', 'Tax', 'EU')
    const before = await stored()

    const body = payload(scenario)
    const resolutions = change(body, scenario, other) ?? {}
    const res = await put(alice, scenario.id, body, resolutions)

    expect(res.status, JSON.stringify(res.data)).toBe(422)
    expect(res.data.data.length).toBeGreaterThan(0)
    expect(await stored()).toEqual(before)
  })

  it.each([
    ['no body', undefined],
    ['no scenario', { resolutions: {} }],
  ])('rejects a body with %s', async (_name, body) => {
    const scenario = await create(alice)

    expect((await api.as(alice)('put', `/api/scenarios/${scenario.id}`, body)).status).toBe(422)
  })

  it("renaming to another scenario's name returns 409", async () => {
    const scenario = await create(alice)
    await create(alice, input('École'))
    await create(bob, input('Money'))
    const before = await stored()

    const res = await put(alice, scenario.id, { ...payload(scenario), name: ' éCOLE ' })

    expect(res.status).toBe(409)
    expect(res.data.statusMessage).toBe('That scenario name is already taken')
    expect(await stored()).toEqual(before)
    // Another user's names are free.
    await save(scenario, { ...payload(scenario), name: 'Money' })
  })
})

describe('ownership', () => {
  it("updating another user's scenario is 404", async () => {
    const scenario = await create(alice)
    const body = { ...payload(scenario), name: 'Taken over' }
    const before = await stored()

    expect((await put(bob, scenario.id, body)).status).toBe(404)
    // Not even when the name or the ids would be refused.
    await create(bob, { name: 'Mine', attributes: [] })
    expect((await put(bob, scenario.id, { name: 'Mine', attributes: [] })).status).toBe(404)
    await api.db.delete(scenarios).where(eq(scenarios.user_id, bob.id))
    expect(await stored()).toEqual(before)
    expect((await put(alice, scenario.id, body)).status).toBe(200)
  })

  it('a deleted scenario is 404', async () => {
    const scenario = await create(alice)
    expect((await put(alice, scenario.id, payload(scenario))).status).toBe(200)
    await api.db.delete(scenarios)

    expect((await put(alice, scenario.id, payload(scenario))).status).toBe(404)
    expect((await stored()).scenarios).toEqual([])
  })

  it('requires a session', async () => {
    const scenario = await create(alice)
    const before = await stored()

    expect((await put(null, scenario.id, { ...payload(scenario), name: 'x' })).status).toBe(401)
    expect(await stored()).toEqual(before)
  })
})

describe('atomicity', () => {
  it('a stale payload omitting a newer in-use option returns 409', async () => {
    const scenario = await create(alice)
    const stale = payload(scenario)
    const fresh = payload(scenario)
    attr(fresh, 'Level').options.push(option('Expert'))
    const newer = await save(scenario, fresh)
    const question = await addQuestion(newer, 'Expert')
    const before = await stored()

    const res = await put(alice, scenario.id, stale)

    expect(res.status).toBe(409)
    expect(res.data.data.conflicts).toEqual([
      { type: 'option-in-use', attributeId: scenario.attributes[0]!.id, optionId: ids(newer).Expert, count: 1 },
    ])
    expect(await stored()).toEqual(before)
    expect(await labelsOf(question)).toEqual(['Expert'])
  })

  type Race = {
    change: (body: ScenarioInput) => void
    /** What another request gives the question between the update's checks and its write. */
    gains: string[]
    conflict: string
  }

  it.each<[string, Race]>([
    ['an option', { change: (b) => remove(b, 'Funds'), gains: ['Funds'], conflict: 'option-in-use' }],
    ['an attribute', { change: (b) => void b.attributes.splice(2, 1), gains: ['EU'], conflict: 'attribute-delete' }],
    [
      'a second option',
      { change: (b) => void (attr(b, 'Tags').selectionMode = 'single'), gains: ['Tax', 'Loans'], conflict: 'multiple-to-single' },
    ],
  ])('returns 409 when a question takes up %s while saving', async (_name, race) => {
    const scenario = await create(alice)
    const question = await addQuestion(scenario)
    const body = payload(scenario)
    body.name = 'Money'
    race.change(body)

    const batch = api.db.batch.bind(api.db)
    const update = vi.spyOn(api.db, 'update')
    let raced: Awaited<ReturnType<typeof stored>> | undefined
    vi.spyOn(api.db, 'batch').mockImplementation((async (statements: Parameters<typeof batch>[0]) => {
      // The update's own batch is the first to follow a call to `db.update`.
      if (update.mock.calls.length && !raced) {
        for (const label of race.gains) {
          await api.db.insert(questionOptions).values({ question_id: question, option_id: ids(scenario)[label]! })
        }
        raced = await stored()
      }
      return batch(statements)
    }) as unknown as typeof api.db.batch)

    const res = await put(alice, scenario.id, body)

    expect(raced).toBeDefined()
    expect(res.status, JSON.stringify(res.data)).toBe(409)
    expect(res.data.data.conflicts).toEqual([expect.objectContaining({ type: race.conflict, count: 1 })])
    expect(await stored()).toEqual(raced)
  })

  it.each([
    ['moving values', 'before insert on question_options'],
    ['deleting options', 'before delete on options'],
    // Only the final collapse drops this value.
    ['the last step', "before delete on question_options when old.option_id = (select id from options where label = 'Loans')"],
  ])('a failed update leaves the scenario unchanged (%s)', async (_name, event) => {
    const scenario = await create(alice)
    await addQuestion(scenario, 'Low', 'Tax', 'Loans', 'EU')
    const before = await stored()
    await api.db.$client.execute(`create trigger boom ${event} begin select raise(abort, 'boom'); end`)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const body = payload(scenario)
    body.name = 'Money'
    body.attributes.splice(2, 1)
    remove(body, 'Low')
    attr(body, 'Level').options.push(option('Top'))
    attr(body, 'Tags').selectionMode = 'single'
    attr(body, 'Tags').options.push(option('Debt'))
    const res = await put(alice, scenario.id, body, {
      removedOptions: { [ids(scenario).Low!]: { moveTo: ids(scenario).Mid } },
      removedAttributes: [scenario.attributes[2]!.id],
      collapseToSingle: [scenario.attributes[1]!.id],
    })

    expect(res.status).toBe(500)
    expect(await stored()).toEqual(before)
  })
})
