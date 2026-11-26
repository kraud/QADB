import { z } from 'zod'

const MAX_LENGTH = 2048

const hostname = (address: string) => {
  try {
    return new URL(address).hostname
  } catch {
    return null
  }
}

/**
 * A question's link as it is stored: an `http` or `https` address as written, a bare domain such as
 * `example.com` with `https://` added, or empty for a blank one. `null` for anything else, as the
 * value becomes an `href`.
 */
export function normalizeLink(input: string): string | null {
  const link = input.trim()
  if (!link) return ''
  if (/^https?:\/\/[^/\\]/i.test(link)) return hostname(link) ? link : null

  const authority = link.split(/[/\\?#]/, 1)[0]!
  if (/\s/.test(link) || !authority || authority.includes('@')) return null
  const address = `https://${link}`
  // A top-level domain in letters (or punycode) tells a domain from a word, a number or a scheme.
  return /\.([a-z]{2,}|xn--[a-z0-9-]+)\.?$/.test(hostname(address) ?? '') ? address : null
}

/** The `link` field of a question body. */
export const linkSchema = z
  .string()
  .trim()
  .max(MAX_LENGTH)
  .transform((value, ctx) => {
    const link = normalizeLink(value)
    if (link === null || link.length > MAX_LENGTH) {
      ctx.addIssue({ code: 'custom', message: 'Enter a web address' })
      return z.NEVER
    }
    return link
  })
