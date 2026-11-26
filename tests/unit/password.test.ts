import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../../server/utils/password'

describe('password', () => {
  it('hashPassword verifies the right password and rejects others', async () => {
    const stored = await hashPassword('correct horse battery')

    expect(stored.startsWith('argon2$')).toBe(true)
    expect(await verifyPassword(stored, 'correct horse battery')).toBe(true)
    expect(await verifyPassword(stored, 'wrong horse battery')).toBe(false)
    expect(await verifyPassword('not-a-stored-hash', 'correct horse battery')).toBe(false)
    expect(await verifyPassword('argon2$garbage', 'correct horse battery')).toBe(false)
    expect(await verifyPassword('pbkdf2$only-two-parts', 'correct horse battery')).toBe(false)
  })
})
