import { hash, verify } from '@node-rs/argon2'
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'

const PBKDF2_ITERATIONS = 100_000
const PBKDF2_KEYLEN = 64

let argon2Warned = false

function hashPbkdf2(plain: string): string {
  const salt = randomBytes(16)
  const derived = pbkdf2Sync(plain, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha256')
  return `pbkdf2$${salt.toString('base64')}$${derived.toString('base64')}`
}

/** Returns a stored hash prefixed `argon2$` or `pbkdf2$`. */
export async function hashPassword(plain: string): Promise<string> {
  try {
    const argon2 = await hash(plain, {
      memoryCost: 19456,
      timeCost: 2,
      outputLen: 32,
      parallelism: 1,
    })
    return `argon2$${argon2}`
  } catch (err) {
    if (!argon2Warned) {
      argon2Warned = true
      console.warn('[qadb] argon2 native hash unavailable, falling back to PBKDF2:', (err as Error).message)
    }
    return hashPbkdf2(plain)
  }
}

/** Dispatches on the stored hash prefix. Returns false on malformed input. */
export async function verifyPassword(stored: string, plain: string): Promise<boolean> {
  if (stored.startsWith('argon2$')) {
    try {
      return await verify(stored.slice('argon2$'.length), plain)
    } catch {
      return false
    }
  }

  if (stored.startsWith('pbkdf2$')) {
    const parts = stored.split('$')
    if (parts.length !== 3) return false
    const salt = Buffer.from(parts[1]!, 'base64')
    const expected = Buffer.from(parts[2]!, 'base64')
    const derived = pbkdf2Sync(plain, salt, PBKDF2_ITERATIONS, expected.length, 'sha256')
    if (derived.length !== expected.length) return false
    return timingSafeEqual(derived, expected)
  }

  return false
}
