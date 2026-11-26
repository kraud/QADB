import { createId } from '@paralleldrive/cuid2'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { attempts, attributes, options, questionOptions, questions, scenarios } from '../../db/schema'
import type { AuthUser } from '../../server/utils/auth'
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
  await api.close()
})

const option = (label: string, extra: object = {}) => ({ label, color: 'green', isDefault: false, ...extra })

/** Two required attributes and an optional one. */
function input(name = 'Finance') {
  return {
    name,
    attributes: [
      {
        name: 'Level',
        selectionMode: 'single',
        ordered: true,
        required: true,
        options: [option('Low', { color: 'blue-1' }), option('High', { color: 'blue-3', isDefault: true })],
      },
      {
        name: 'Tags',
        selectionMode: 'multiple',
        ordered: false,
        required: true,
        options: [option('Tax', { isDefault: true }), option('Loans', { isDefault: true }), option('Funds')],
      },
      { name: 'Region', selectionMode: 'single', ordered: false, required: false, options: [option('EU'), option('US')] },
    ],
  }
}

async function create(user: AuthUser, body: object = input()): Promise<Scenario> {
  const res = await api.as(user)('post', '/api/scenarios', body)
  expect(res.status, JSON.stringify(res.data)).toBe(200)
  return res.data
}

/** Question routes do not exist yet, so rows go straight into the database. */
async function addQuestion(scenario: Scenario, optionIds: string[]): Promise<string> {
  const id = createId()
  await api.db.insert(questions).values({ id, scenario_id: scenario.id, question: 'Q', answer: 'A' })
  for (const optionId of optionIds) {
    await api.db.insert(questionOptions).values({ question_id: id, option_id: optionId })
  }
  return id
}

/** Option ids by label. */
function optionIds(scenario: Scenario): Record<string, string> {
  return Object.fromEntries(scenario.attributes.flatMap((a) => a.options.map((o) => [o.label, o.id])))
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

describe('creating a scenario', () => {
  it('creates a scenario with positions from array order and returns it', async () => {
    const body = input('  Finance  ')
    const created = await create(alice, body)

    const id = expect.any(String)
    expect(created).toEqual({
      id,
      name: 'Finance',
      attributes: body.attributes.map((attribute, position) => ({
        ...attribute,
        id,
        position,
        options: attribute.options.map((o, optionPosition) => ({ ...o, id, position: optionPosition })),
      })),
    })

    const read = await api.as(alice)('get', `/api/scenarios/${created.id}`)
    expect(read.status).toBe(200)
    expect(read.data).toEqual({ ...created, usage: expect.any(Object), questionCount: 0, incompleteCount: 0 })

    const [row] = await api.db.select().from(scenarios)
    expect(row).toMatchObject({ user_id: alice.id, name: 'Finance' })
  })

  it('creates a scenario without attributes', async () => {
    const created = await create(alice, { name: 'Plain', attributes: [] })

    expect(created.attributes).toEqual([])
    expect((await api.as(alice)('get', `/api/scenarios/${created.id}`)).data).toEqual({
      ...created,
      usage: { optionCounts: {}, attributeCounts: {}, multiValueCounts: {} },
      questionCount: 0,
      incompleteCount: 0,
    })
  })

  it('rejects a duplicate name for the same user, allows it for another user', async () => {
    await create(alice, { name: 'École', attributes: [] })

    const duplicate = await api.as(alice)('post', '/api/scenarios', { ...input(), name: '  éCOLE ' })

    expect(duplicate.status).toBe(409)
    expect(duplicate.data.statusMessage).toBe('That scenario name is already taken')
    expect((await stored()).scenarios).toHaveLength(1)
    expect((await stored()).attributes).toEqual([])

    await create(bob, { name: 'École', attributes: [] })
  })

  it.each([
    ['no body', undefined],
    ['a blank name', { ...input(), name: '   ' }],
    ['no attribute list', { name: 'Finance' }],
    ['one option', { name: 'F', attributes: [{ ...input().attributes[0], options: [option('Only')] }] }],
    ['an unknown color', { name: 'F', attributes: [{ ...input().attributes[2], options: [option('a'), option('b', { color: 'x' })] }] }],
    ['an attribute id', { name: 'F', attributes: [{ ...input().attributes[0], id: 'foreign' }] }],
    ['an option id', { name: 'F', attributes: [{ ...input().attributes[2], options: [option('a'), option('b', { id: 'foreign' })] }] }],
  ])('rejects invalid input with 422 and writes nothing (%s)', async (_name, body) => {
    const res = await api.as(alice)('post', '/api/scenarios', body)

    expect(res.status).toBe(422)
    expect(res.data.data.length).toBeGreaterThan(0)
    expect(await stored()).toEqual({
      scenarios: [],
      attributes: [],
      options: [],
      questions: [],
      questionOptions: [],
      attempts: [],
    })
  })

  it('names the field that is invalid', async () => {
    const res = await api.as(alice)('post', '/api/scenarios', { ...input(), name: '' })

    expect(res.data.data).toEqual([expect.objectContaining({ path: ['name'], message: 'Enter a name' })])
  })
})

describe('listing and reading', () => {
  it('lists only own scenarios with question and incomplete counts', async () => {
    const finance = await create(alice)
    const plain = await create(alice, { name: 'Plain', attributes: [] })
    const empty = await create(alice, input('Empty'))
    const other = await create(bob)

    const ids = optionIds(finance)
    await addQuestion(finance, [ids.Low!, ids.Tax!, ids.EU!])
    await addQuestion(finance, [ids.High!, ids.Tax!, ids.Loans!]) // lacks only the optional attribute
    await addQuestion(finance, [ids.Low!, ids.EU!]) // lacks Tags
    await addQuestion(finance, []) // lacks both, counted once
    await addQuestion(plain, [])
    await addQuestion(other, [])

    const res = await api.as(alice)('get', '/api/scenarios')

    expect(res.status).toBe(200)
    expect(res.data).toEqual([
      { id: finance.id, name: 'Finance', questionCount: 4, incompleteCount: 2 },
      { id: plain.id, name: 'Plain', questionCount: 1, incompleteCount: 0 },
      { id: empty.id, name: 'Empty', questionCount: 0, incompleteCount: 0 },
    ])

    const read = await api.as(alice)('get', `/api/scenarios/${finance.id}`)
    expect(read.data).toMatchObject({ questionCount: 4, incompleteCount: 2 })
  })

  it('lists nothing for a user without scenarios', async () => {
    await create(bob)

    expect((await api.as(alice)('get', '/api/scenarios')).data).toEqual([])
  })

  it('returns usage counts', async () => {
    const finance = await create(alice)
    const other = await create(alice, input('Other'))
    const ids = optionIds(finance)
    await addQuestion(finance, [ids.Low!, ids.Tax!, ids.Loans!, ids.Funds!])
    await addQuestion(finance, [ids.Low!, ids.Tax!, ids.Loans!])
    await addQuestion(finance, [ids.Tax!])
    await addQuestion(other, [optionIds(other).High!])

    const res = await api.as(alice)('get', `/api/scenarios/${finance.id}`)

    const [level, tags, region] = finance.attributes
    expect(res.data.usage).toEqual({
      optionCounts: { [ids.Low!]: 2, [ids.High!]: 0, [ids.Tax!]: 3, [ids.Loans!]: 2, [ids.Funds!]: 1, [ids.EU!]: 0, [ids.US!]: 0 },
      attributeCounts: { [level!.id]: 2, [tags!.id]: 3, [region!.id]: 0 },
      multiValueCounts: { [level!.id]: 0, [tags!.id]: 2, [region!.id]: 0 },
    })
  })
})

describe('ownership', () => {
  it.each(['read', 'delete'])("%s of another user's scenario is 404", async (action) => {
    const scenario = await create(alice)
    const before = await stored()

    const res =
      action === 'read'
        ? await api.as(bob)('get', `/api/scenarios/${scenario.id}`)
        : await api.as(bob)('delete', `/api/scenarios/${scenario.id}`, { confirmName: scenario.name })

    expect(res.status).toBe(404)
    expect(await stored()).toEqual(before)
  })

  it('an unknown scenario is 404', async () => {
    expect((await api.as(alice)('get', '/api/scenarios/nope')).status).toBe(404)
    expect((await api.as(alice)('delete', '/api/scenarios/nope', { confirmName: 'x' })).status).toBe(404)
  })

  it.each([
    ['get', '/api/scenarios', undefined],
    ['post', '/api/scenarios', input()],
    ['get', '/api/scenarios/any', undefined],
    ['delete', '/api/scenarios/any', { confirmName: 'x' }],
  ])('requires a session (%s %s)', async (method, url, body) => {
    expect((await api.as(null)(method, url, body)).status).toBe(401)
    expect((await stored()).scenarios).toEqual([])
  })
})

describe('deleting a scenario', () => {
  /** A scenario with a question, its options and an attempt. */
  async function used(name: string) {
    const scenario = await create(alice, input(name))
    const questionId = await addQuestion(scenario, [optionIds(scenario).Low!])
    await api.db
      .insert(attempts)
      .values({ id: createId(), question_id: questionId, user_id: alice.id, correct: 1 })
    return scenario
  }

  it.each([
    ['no body', undefined],
    ['no name', {}],
    ['a number', { confirmName: 1 }],
    ['another name', { confirmName: 'Keep' }],
    ['another case', { confirmName: 'doomed' }],
    ['part of the name', { confirmName: 'Doom' }],
  ])('delete requires the name (%s)', async (_name, body) => {
    const scenario = await used('Doomed')
    const before = await stored()

    const res = await api.as(alice)('delete', `/api/scenarios/${scenario.id}`, body)

    expect(res.status).toBe(422)
    expect(await stored()).toEqual(before)
  })

  it('delete requires the name, then removes questions, options and attempts', async () => {
    await used('Keep')
    const kept = await stored()
    const doomed = await used('Doomed')

    const res = await api.as(alice)('delete', `/api/scenarios/${doomed.id}`, { confirmName: ' Doomed ' })

    expect(res).toEqual({ status: 204, data: null })
    expect(await stored()).toEqual(kept)
  })
})
