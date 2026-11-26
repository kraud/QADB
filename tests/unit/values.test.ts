import { describe, expect, it } from 'vitest'
import type { Attribute, Scenario } from '../../shared/scenario/types'
import { defaultValues, missingAttributeIds, validateValues } from '../../shared/scenario/values'

function attribute(id: string, extra: Partial<Attribute> = {}, defaults: string[] = []): Attribute {
  return {
    id,
    name: id,
    selectionMode: 'single',
    ordered: false,
    required: false,
    position: 0,
    options: [1, 2, 3].map((n) => ({
      id: `${id}${n}`,
      label: `${id}${n}`,
      color: 'blue-1' as const,
      position: n - 1,
      isDefault: defaults.includes(`${id}${n}`),
    })),
    ...extra,
  }
}

const scenario: Scenario = {
  id: 's',
  name: 'S',
  attributes: [
    attribute('level', { required: true }, ['level2']),
    attribute('tags', { selectionMode: 'multiple', required: true }, ['tags1', 'tags3']),
    attribute('extra'),
  ],
}

const paths = (issues: { path: string[] }[]) => issues.map((issue) => issue.path)

describe('values', () => {
  it('defaultValues preselects defaults and leaves the rest empty', () => {
    expect(defaultValues(scenario)).toEqual({ level: ['level2'], tags: ['tags1', 'tags3'], extra: [] })
    expect(defaultValues({ id: 's', name: 'S', attributes: [] })).toEqual({})
  })

  it('missingAttributeIds lists required attributes that are empty, in attribute order', () => {
    expect(missingAttributeIds(scenario, {})).toEqual(['level', 'tags'])
    expect(missingAttributeIds(scenario, { level: [], tags: ['tags1'] })).toEqual(['level'])
    expect(missingAttributeIds(scenario, { level: ['level1'], tags: ['tags1'], extra: [] })).toEqual([])
  })

  it('validateValues accepts a complete, valid set', () => {
    const values = { level: ['level1'], tags: ['tags1', 'tags2'], extra: [] }

    expect(validateValues(scenario, values, { requireAll: true })).toEqual([])
  })

  it('validateValues rejects two options in single mode, unknown attribute, unknown option, option of another attribute', () => {
    const check = (values: Record<string, string[]>) => paths(validateValues(scenario, values, { requireAll: false }))

    expect(check({ level: ['level1', 'level2'] })).toEqual([['values', 'level']])
    expect(check({ nope: ['level1'] })).toEqual([['values', 'nope']])
    expect(check({ nope: [] })).toEqual([['values', 'nope']])
    expect(check({ level: ['nope'] })).toEqual([['values', 'level']])
    expect(check({ level: ['tags1'] })).toEqual([['values', 'level']])
    expect(check({ constructor: ['level1'] })).toEqual([['values', 'constructor']])
  })

  it('validateValues rejects an option listed twice', () => {
    expect(paths(validateValues(scenario, { tags: ['tags1', 'tags1'] }, { requireAll: false })))
      .toEqual([['values', 'tags']])
  })

  it('validateValues requires required attributes only when requireAll is true', () => {
    const values = { level: [] }

    expect(validateValues(scenario, values, { requireAll: false })).toEqual([])
    expect(paths(validateValues(scenario, values, { requireAll: true })))
      .toEqual([['values', 'level'], ['values', 'tags']])
  })

  it('validateValues names the attribute in its messages', () => {
    const issues = validateValues(scenario, { level: ['level1', 'level2'] }, { requireAll: true })

    expect(issues.map((issue) => issue.message)).toEqual(['level takes only one option', 'tags is required'])
  })
})
