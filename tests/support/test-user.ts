import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const ENV_FILE = fileURLToPath(new URL('../../.env.testuser', import.meta.url))

/** Credentials of the local test account, generated into `.env.testuser` on first use. */
export function loadTestUser(): { username: string; password: string } {
  if (!existsSync(ENV_FILE)) {
    const content = [
      '# Local test account for development and automated checks. Gitignored.',
      'TEST_USER_USERNAME=claude_test',
      `TEST_USER_PASSWORD=${randomBytes(24).toString('base64url')}`, // 32 characters
      '',
    ].join('\n')
    writeFileSync(ENV_FILE, content, { mode: 0o600, flag: 'wx' })
  }

  const { TEST_USER_USERNAME: username, TEST_USER_PASSWORD: password } = parseEnv(readFileSync(ENV_FILE, 'utf8'))
  if (!username || !password) {
    throw new Error('.env.testuser must define TEST_USER_USERNAME and TEST_USER_PASSWORD')
  }
  return { username, password }
}
