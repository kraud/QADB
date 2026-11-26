import { describe, expect, it } from 'vitest'
import { findConflicts } from '../../shared/scenario/diff'
import type { ScenarioInput } from '../../shared/scenario/schema'
import type { Scenario, SelectionMode, Usage } from '../../shared/scenario/types'

const attribute = (id: string, selectionMode: SelectionMode, optionIds: string[], position: number) => ({
  id,
  name: id,
  selectionMode,
  ordered: false,
  required: false,
  position,
  options: optionIds.map((optionId, optionPosition) => ({
    id: optionId,
    label: optionId,
    color: 'green' as const,
    position: optionPosition,
    isDefault: false,
  })),
})

const current: Scenario = {
  id: 's',
  name: 'S',
  attributes: [attribute('level', 'single', ['low', 'mid', 'high'], 0), attribute('tags', 'multiple', ['a', 'b', 'c'], 1)],
}

const usage: Usage = {
  optionCounts: { low: 2, mid: 1, high: 0, a: 4, b: 3, c: 0 },
  attributeCounts: { level: 3, tags: 5 },
  multiValueCounts: { level: 0, tags: 2 },
}

/** The current scenario as the editor would send it back, unchanged. */
const unchanged = (): ScenarioInput => ({
  name: current.name,
  attributes: current.attributes.map(({ position: _, options, ...rest }) => ({
    ...rest,
    options: options.map(({ position: _position, ...option }) => option),
  })),
})

/** `unchanged` without these options. */
function without(...ids: string[]): ScenarioInput {
  const next = unchanged()
  for (const a of next.attributes) a.options = a.options.filter((o) => !ids.includes(o.id!))
  return next
}

describe('findConflicts', () => {
  it('finds nothing in an unchanged scenario', () => {
    expect(findConflicts(current, unchanged(), usage, {})).toEqual([])
  })

  it('reports each removed option in use with its count, and no unused one', () => {
    expect(findConflicts(current, without('low', 'high', 'b', 'c'), usage, {})).toEqual([
      { type: 'option-in-use', attributeId: 'level', optionId: 'low', count: 2 },
      { type: 'option-in-use', attributeId: 'tags', optionId: 'b', count: 3 },
    ])
  })

  it.each([
    ['moved', 'mid'],
    ['left empty', null],
  ])('an option resolution settles it (%s)', (_name, moveTo) => {
    const next = without('low', 'b')

    expect(findConflicts(current, next, usage, { removedOptions: { low: { moveTo } } })).toEqual([
      { type: 'option-in-use', attributeId: 'tags', optionId: 'b', count: 3 },
    ])
  })

  it('reports a removed attribute once, without its options', () => {
    const next = { ...unchanged(), attributes: [unchanged().attributes[0]!] }

    expect(findConflicts(current, next, usage, {})).toEqual([{ type: 'attribute-delete', attributeId: 'tags', count: 5 }])
    expect(findConflicts(current, next, usage, { removedAttributes: ['tags'] })).toEqual([])
    // Settling its options does not settle the attribute.
    expect(findConflicts(current, next, usage, { removedOptions: { a: { moveTo: null } } })).toHaveLength(1)
  })

  it('treats an attribute sent without its id as removed', () => {
    const next = unchanged()
    delete next.attributes[1]!.id

    expect(findConflicts(current, next, usage, {})).toEqual([{ type: 'attribute-delete', attributeId: 'tags', count: 5 }])
  })

  it('reports multiple to single until confirmed', () => {
    const next = unchanged()
    next.attributes[1]!.selectionMode = 'single'

    expect(findConflicts(current, next, usage, {})).toEqual([
      { type: 'multiple-to-single', attributeId: 'tags', count: 2 },
    ])
    expect(findConflicts(current, next, usage, { collapseToSingle: ['tags'] })).toEqual([])
  })

  it('reports nothing when the counts are zero', () => {
    const unused: Usage = { optionCounts: {}, attributeCounts: { level: 0 }, multiValueCounts: {} }
    const next = { name: 'S', attributes: [{ ...unchanged().attributes[1]!, selectionMode: 'single' as const }] }

    expect(findConflicts(current, next, unused, {})).toEqual([])
  })
})
