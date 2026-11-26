import type { Scenario } from './types'

export type SortKey = '' | 'pct' | 'amount' | `attr:${string}`
export type SortDir = 'asc' | 'desc'

export interface Filters {
  /** Chosen option ids, across all attributes. */
  options: string[]
  /** Ids of the attributes whose "None" chip is chosen. */
  none: string[]
  incomplete: boolean
  nbd: 'all' | 'yes' | 'no'
  mastered: 'all' | 'yes' | 'no'
  op: 'all' | '>' | '<' | '='
  n: number
  recent: boolean
  q: string
}

export function emptyFilters(): Filters {
  return {
    options: [],
    none: [],
    incomplete: false,
    nbd: 'all',
    mastered: 'all',
    op: 'all',
    n: 0,
    recent: false,
    q: '',
  }
}

const OP_PARAM = { '>': 'gt', '<': 'lt', '=': 'eq' } as const
const YES_NO_PARAM = { yes: 'true', no: 'false' } as const

/** The query string (with its leading `?`, or empty) for the question list. Defaults are left out. */
export function buildQuestionQuery(f: Filters, sortKey: SortKey, sortDir: SortDir): string {
  const params = new URLSearchParams()
  for (const id of f.options) params.append('option', id)
  for (const id of f.none) params.append('none', id)
  if (f.incomplete) params.set('incomplete', 'true')
  if (f.nbd !== 'all') params.set('nbd', YES_NO_PARAM[f.nbd])
  if (f.mastered !== 'all') params.set('mastered', YES_NO_PARAM[f.mastered])
  if (f.op !== 'all') {
    params.set('amountOp', OP_PARAM[f.op])
    params.set('amountValue', String(f.n))
  }
  if (f.recent) params.set('recentlyFailed', 'true')
  if (f.q.trim()) params.set('q', f.q.trim())
  if (sortKey) params.set('sortKey', sortKey)
  if (sortDir !== 'asc') params.set('sortDir', sortDir)
  const query = params.toString()
  return query ? `?${query}` : ''
}

/** The distinct non-empty strings of a parameter given once or several times. */
function idList(raw: unknown): string[] {
  const all: unknown[] = Array.isArray(raw) ? raw : [raw]
  return [...new Set(all.filter((value): value is string => typeof value === 'string' && value !== ''))]
}

function yesNo(raw: unknown): Filters['nbd'] {
  if (raw === 'true') return 'yes'
  return raw === 'false' ? 'no' : 'all'
}

/** The amount filter applies only with both a known operator and a whole, non-negative amount. */
function amount(rawOp: unknown, rawValue: unknown): Pick<Filters, 'op' | 'n'> {
  const op = (['>', '<', '='] as const).find((symbol) => OP_PARAM[symbol] === rawOp)
  const n = typeof rawValue === 'string' && /^\d+$/.test(rawValue) ? Number(rawValue) : Number.NaN
  return op && Number.isSafeInteger(n) ? { op, n } : { op: 'all', n: 0 }
}

function parseSortKey(raw: unknown): SortKey {
  if (raw === 'pct' || raw === 'amount') return raw
  return typeof raw === 'string' && /^attr:./.test(raw) ? (raw as SortKey) : ''
}

/**
 * Reads a URL query object, ignoring anything malformed. Whether the ids still exist in the
 * scenario is for the caller to check.
 */
export function parseQuestionQuery(raw: Record<string, unknown>): { filters: Filters; sortKey: SortKey; sortDir: SortDir } {
  return {
    filters: {
      options: idList(raw.option),
      none: idList(raw.none),
      incomplete: raw.incomplete === 'true',
      nbd: yesNo(raw.nbd),
      mastered: yesNo(raw.mastered),
      ...amount(raw.amountOp, raw.amountValue),
      recent: raw.recentlyFailed === 'true',
      q: typeof raw.q === 'string' ? raw.q.trim() : '',
    },
    sortKey: parseSortKey(raw.sortKey),
    sortDir: raw.sortDir === 'desc' ? 'desc' : 'asc',
  }
}

/**
 * How many filters are in effect: one per attribute with any chip (options, "None") chosen, plus
 * one for each other filter. Ids that are not in the scenario count for nothing.
 */
export function countActiveFilters(f: Filters, scenario: Pick<Scenario, 'attributes'>): number {
  const attributes = scenario.attributes.filter(
    (attribute) => f.none.includes(attribute.id) || attribute.options.some((option) => f.options.includes(option.id)),
  )
  const others = [f.incomplete, f.nbd !== 'all', f.mastered !== 'all', f.op !== 'all', f.recent, f.q.trim() !== '']
  return attributes.length + others.filter(Boolean).length
}
