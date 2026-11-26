import { describe, expect, it } from 'vitest'
import { planBulk } from '../../shared/scenario/bulk'
import type { BulkAction } from '../../shared/scenario/bulk'
import type { Attribute } from '../../shared/scenario/types'

function attribute(extra: Partial<Attribute> = {}): Attribute {
  return {
    id: 'a',
    name: 'A',
    selectionMode: 'single',
    ordered: false,
    required: false,
    position: 0,
    options: ['x', 'y', 'z'].map((id, position) => ({ id, label: id, color: 'blue-1' as const, position, isDefault: false })),
    ...extra,
  }
}

const single = attribute()
const multiple = attribute({ selectionMode: 'multiple' })

const items = (...values: string[][]) => values.map((optionIds, i) => ({ id: `q${i + 1}`, values: { a: optionIds } }))

describe('planBulk', () => {
  it('planBulk set/clear for single, add/replace/remove for multiple, with add never duplicating', () => {
    expect(planBulk(single, items(['x'], []), 'set', ['y'])).toEqual({
      ok: true,
      changes: [{ id: 'q1', optionIds: ['y'] }, { id: 'q2', optionIds: ['y'] }],
    })
    expect(planBulk(single, items(['x']), 'clear', [])).toEqual({ ok: true, changes: [{ id: 'q1', optionIds: [] }] })
    // Chosen out of order and twice: the result follows option order without duplicates.
    expect(planBulk(multiple, items(['y'], []), 'add', ['z', 'y', 'x', 'x'])).toEqual({
      ok: true,
      changes: [{ id: 'q1', optionIds: ['x', 'y', 'z'] }, { id: 'q2', optionIds: ['x', 'y', 'z'] }],
    })
    expect(planBulk(multiple, items(['x', 'y']), 'replace', ['z'])).toEqual({ ok: true, changes: [{ id: 'q1', optionIds: ['z'] }] })
    expect(planBulk(multiple, items(['x', 'y', 'z']), 'remove', ['y'])).toEqual({
      ok: true,
      changes: [{ id: 'q1', optionIds: ['x', 'z'] }],
    })
  })

  it('treats a question without an entry for the attribute as empty', () => {
    expect(planBulk(multiple, [{ id: 'q1', values: {} }], 'add', ['x'])).toEqual({
      ok: true,
      changes: [{ id: 'q1', optionIds: ['x'] }],
    })
  })

  it('planBulk rejects actions that do not fit the mode, and clear/remove that would empty a required attribute, with the count', () => {
    const invalid = { ok: false, reason: 'invalid', count: 0 }
    for (const action of ['add', 'replace', 'remove'] as BulkAction[]) {
      expect(planBulk(single, items(['x']), action, ['y'])).toEqual(invalid)
    }
    for (const action of ['set', 'clear'] as BulkAction[]) {
      expect(planBulk(multiple, items(['x']), action, ['y'])).toEqual(invalid)
    }

    expect(planBulk(attribute({ required: true }), items(['x'], ['y']), 'clear', []))
      .toEqual({ ok: false, reason: 'would-empty', count: 2 })

    const required = attribute({ selectionMode: 'multiple', required: true })
    expect(planBulk(required, items(['x'], ['x', 'y'], ['x']), 'remove', ['x']))
      .toEqual({ ok: false, reason: 'would-empty', count: 2 })
  })

  it('counts an already empty question as left empty by remove or clear on a required attribute', () => {
    const required = attribute({ selectionMode: 'multiple', required: true })

    expect(planBulk(required, items(['x', 'y'], []), 'remove', ['x'])).toEqual({ ok: false, reason: 'would-empty', count: 1 })
    expect(planBulk(attribute({ required: true }), items([]), 'clear', [])).toEqual({ ok: false, reason: 'would-empty', count: 1 })
  })

  it('allows emptying an optional attribute', () => {
    expect(planBulk(multiple, items(['x']), 'remove', ['x'])).toEqual({ ok: true, changes: [{ id: 'q1', optionIds: [] }] })
  })

  it('rejects missing, too many or foreign options', () => {
    const invalid = { ok: false, reason: 'invalid', count: 0 }

    expect(planBulk(single, items(['x']), 'set', [])).toEqual(invalid)
    expect(planBulk(single, items(['x']), 'set', ['x', 'y'])).toEqual(invalid)
    expect(planBulk(single, items(['x']), 'set', ['foreign'])).toEqual(invalid)
    for (const action of ['add', 'replace', 'remove'] as BulkAction[]) {
      expect(planBulk(multiple, items(['x']), action, [])).toEqual(invalid)
      expect(planBulk(multiple, items(['x']), action, ['y', 'foreign'])).toEqual(invalid)
    }
  })

  it('planBulk lists only questions that actually change', () => {
    expect(planBulk(single, items(['y'], ['x']), 'set', ['y'])).toEqual({ ok: true, changes: [{ id: 'q2', optionIds: ['y'] }] })
    expect(planBulk(single, items([]), 'clear', [])).toEqual({ ok: true, changes: [] })
    expect(planBulk(multiple, items(['x', 'y'], ['x']), 'add', ['y'])).toEqual({
      ok: true,
      changes: [{ id: 'q2', optionIds: ['x', 'y'] }],
    })
    // The same set in another order is not a change.
    expect(planBulk(multiple, items(['y', 'x']), 'replace', ['x', 'y'])).toEqual({ ok: true, changes: [] })
    expect(planBulk(multiple, items(['x'], []), 'remove', ['z'])).toEqual({ ok: true, changes: [] })
  })
})
