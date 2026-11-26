import { afterEach, describe, expect, it, vi } from 'vitest'
import { fmtDT, rel } from '~/utils/format'
import { renderMarkdown } from '~/utils/markdown'
import { shuffle } from '~/utils/shuffle'

describe('shuffle', () => {
  it('shuffle returns a permutation without mutating input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const original = [...input]

    const out = shuffle(input)

    expect(out).not.toBe(input)
    expect([...out].sort((a, b) => a - b)).toEqual([...original].sort((a, b) => a - b))
    expect(input).toEqual(original)
  })
})

describe('format', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rel formats now, minutes, hours, days, weeks', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 12, 16, 20))
    const now = Date.now()
    const minute = 60_000
    const hour = 60 * minute
    const day = 24 * hour

    expect(rel(now)).toBe('now')
    expect(rel(now - 5 * minute)).toBe('5m ago')
    expect(rel(now - 3 * hour)).toBe('3h ago')
    expect(rel(now - 2 * day)).toBe('2d ago')
    expect(rel(now - 7 * day)).toBe('1w ago')
  })

  it('fmtDT formats as "Aug 12, 2026 · 16:20"', () => {
    // Built from local-time parts, so the result does not depend on the time zone.
    expect(fmtDT(new Date(2026, 7, 12, 16, 20).getTime())).toBe('Aug 12, 2026 · 16:20')
  })
})

describe('renderMarkdown', () => {
  it('renderMarkdown strips script tags and keeps bold', () => {
    const html = renderMarkdown('**bold** <script>alert(1)</script>')

    expect(html).toContain('<strong>bold</strong>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)')
  })
})
