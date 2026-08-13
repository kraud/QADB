const D = 864e5

/** Relative time — "now", "5m ago", "3h ago", "2d ago", "1w ago". */
export function rel(ts: number): string {
  const d = Date.now() - ts
  if (d < 6e4) return 'now'
  if (d < 36e5) return Math.round(d / 6e4) + 'm ago'
  if (d < D) return Math.round(d / 36e5) + 'h ago'
  if (d < 7 * D) return Math.round(d / D) + 'd ago'
  return Math.round(d / (7 * D)) + 'w ago'
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Absolute date·time — "Aug 12, 2026 · 16:20". */
export function fmtDT(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${p(d.getHours())}:${p(d.getMinutes())}`
}
