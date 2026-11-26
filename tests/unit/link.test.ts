import { describe, expect, it } from 'vitest'
import { normalizeLink } from '../../shared/scenario/link'

describe('normalizeLink', () => {
  it.each([
    'https://example.com',
    'http://example.com/path?q=a%20b#part',
    'HTTPS://Example.com/Path',
    'http://localhost:3000/x',
    'https://192.168.1.1/admin',
    'https://en.wikipedia.org/wiki/Closure_(computer_programming)',
  ])('keeps the web address %s as written', (link) => {
    expect(normalizeLink(link)).toBe(link)
  })

  it.each([
    ['example.com', 'https://example.com'],
    ['www.example.co.uk/path?q=1#part', 'https://www.example.co.uk/path?q=1#part'],
    ['example.com:8080/path', 'https://example.com:8080/path'],
    ['münchen.de', 'https://münchen.de'],
    ['example.com/a:b@c', 'https://example.com/a:b@c'],
  ])('adds https to the bare domain %s', (link, expected) => {
    expect(normalizeLink(link)).toBe(expected)
  })

  it('trims, and takes a blank link as empty', () => {
    expect(normalizeLink('  example.com  ')).toBe('https://example.com')
    expect(normalizeLink('   ')).toBe('')
  })

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(document.domain)',
    'java\nscript:alert(1)',
    'javascript.example:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox',
    'file:///etc/passwd',
    'ftp://example.com',
    'mailto:someone@example.com',
    'someone@example.com',
    '//example.com',
    '/relative/path',
    'http:example.com',
    'https://',
    'https://exa mple.com',
    'not a link',
    'word',
    '1.5',
    'localhost:3000',
  ])('refuses %j', (link) => {
    expect(normalizeLink(link)).toBeNull()
  })
})
