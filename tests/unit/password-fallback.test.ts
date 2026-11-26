import { describe, expect, it, vi } from 'vitest'
import { hashPassword, verifyPassword } from '../../server/utils/password'

// As on a platform where the native argon2 binary cannot run.
vi.mock('@node-rs/argon2', () => ({
  hash: () => Promise.reject(new Error('no native binary')),
  verify: () => Promise.reject(new Error('no native binary')),
}))

describe('password without native argon2', () => {
  it('stores a salted PBKDF2 hash that verifies, and warns only once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const first = await hashPassword('correct horse battery')
    const second = await hashPassword('correct horse battery')

    expect(first).toMatch(/^pbkdf2\$[^$]+\$[^$]+$/)
    expect(first).not.toContain('correct horse battery')
    expect(second).not.toBe(first)
    expect(await verifyPassword(first, 'correct horse battery')).toBe(true)
    expect(await verifyPassword(second, 'correct horse battery')).toBe(true)
    expect(await verifyPassword(first, 'wrong horse battery')).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('rejects an argon2 hash it cannot check', async () => {
    expect(await verifyPassword('argon2$whatever', 'correct horse battery')).toBe(false)
  })
})
