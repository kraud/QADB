import { describe, expect, it } from 'vitest'
import { buildQuestionQuery, countActiveFilters, emptyFilters, parseQuestionQuery } from '../../shared/scenario/query'
import type { Filters, SortKey } from '../../shared/scenario/query'

/** A query string as the router and the server see it: one value is a string, several are an array. */
function toObject(query: string): Record<string, string | string[]> {
  const params = new URLSearchParams(query)
  return Object.fromEntries([...new Set(params.keys())].map((key) => {
    const all = params.getAll(key)
    return [key, all.length > 1 ? all : all[0]!]
  }))
}

const full: Filters = {
  options: ['o1', 'o2'],
  none: ['a1'],
  incomplete: true,
  nbd: 'no',
  mastered: 'yes',
  op: '>',
  n: 3,
  recent: true,
  q: '50% off_ & more',
}

describe('query', () => {
  it('emptyFilters has nothing active and returns fresh lists', () => {
    expect(emptyFilters()).toEqual({
      options: [], none: [], incomplete: false, nbd: 'all', mastered: 'all', op: 'all', n: 0, recent: false, q: '',
    })
    expect(emptyFilters().options).not.toBe(emptyFilters().options)
    expect(countActiveFilters(emptyFilters())).toBe(0)
  })

  it('buildQuestionQuery is empty for the defaults', () => {
    expect(buildQuestionQuery(emptyFilters(), '', 'asc')).toBe('')
    expect(buildQuestionQuery({ ...emptyFilters(), n: 4, q: '   ' }, '', 'asc')).toBe('')
  })

  it('buildQuestionQuery names the parameters', () => {
    const query = buildQuestionQuery({ ...full, q: '  hi  ' }, 'attr:a1', 'desc')

    expect(query.startsWith('?')).toBe(true)
    expect(toObject(query)).toEqual({
      option: ['o1', 'o2'],
      none: 'a1',
      incomplete: 'true',
      nbd: 'false',
      mastered: 'true',
      amountOp: 'gt',
      amountValue: '3',
      recentlyFailed: 'true',
      q: 'hi',
      sortKey: 'attr:a1',
      sortDir: 'desc',
    })
  })

  it('buildQuestionQuery and parseQuestionQuery round-trip', () => {
    const cases: [Filters, SortKey, 'asc' | 'desc'][] = [
      [emptyFilters(), '', 'asc'],
      [emptyFilters(), '', 'desc'],
      [full, 'attr:a1', 'desc'],
      [{ ...emptyFilters(), options: ['o1'], nbd: 'yes', mastered: 'no', op: '<', n: 2 }, 'pct', 'asc'],
      [{ ...emptyFilters(), none: ['a1', 'a2'], op: '=', n: 0 }, 'amount', 'desc'],
    ]
    for (const [filters, sortKey, sortDir] of cases) {
      const parsed = parseQuestionQuery(toObject(buildQuestionQuery(filters, sortKey, sortDir)))

      expect(parsed).toEqual({ filters, sortKey, sortDir })
    }
  })

  it('parseQuestionQuery ignores malformed values', () => {
    const defaults = { filters: emptyFilters(), sortKey: '', sortDir: 'asc' }

    expect(parseQuestionQuery({})).toEqual(defaults)
    expect(parseQuestionQuery({
      option: ['', null, 5],
      none: { a: 1 },
      incomplete: 'yes',
      nbd: 'maybe',
      mastered: ['true', 'false'],
      amountOp: '>',
      amountValue: '3',
      recentlyFailed: '1',
      q: ['a', 'b'],
      sortKey: 'difficulty',
      sortDir: 'down',
      unknown: 'x',
    })).toEqual(defaults)
    expect(parseQuestionQuery({ sortKey: 'attr:' })).toEqual(defaults)
    expect(parseQuestionQuery({ sortKey: ['pct', 'amount'] })).toEqual(defaults)
  })

  it('parseQuestionQuery needs both a known operator and a whole, non-negative amount', () => {
    for (const amountValue of [undefined, '', 'abc', '3abc', '-1', '1.5', ' ', '9'.repeat(30), ['1', '2']]) {
      expect(parseQuestionQuery({ amountOp: 'gt', amountValue }).filters).toEqual(emptyFilters())
    }
    expect(parseQuestionQuery({ amountValue: '3' }).filters).toEqual(emptyFilters())
  })

  it('parseQuestionQuery keeps the usable entries of a list, once each', () => {
    const { filters } = parseQuestionQuery({ option: ['o1', null, '', 'o1', 'o2'], none: 'a1', q: '  two words ' })

    expect(filters).toMatchObject({ options: ['o1', 'o2'], none: ['a1'], q: 'two words' })
  })

  it('countActiveFilters counts each chip and each other active filter', () => {
    expect(countActiveFilters({ ...emptyFilters(), options: ['o1', 'o2'], none: ['a1'] })).toBe(3)
    expect(countActiveFilters(full)).toBe(9)
    expect(countActiveFilters({ ...emptyFilters(), n: 5, q: '  ' })).toBe(0)
  })
})
