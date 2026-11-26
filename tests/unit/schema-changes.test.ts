// `drizzle-kit push` can drop data, so the project offers no way to run it: only the migration script
// changes a schema.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8')

describe('schema changes', () => {
  it('has no drizzle-kit to push with, and no configuration naming a database', () => {
    const manifest = JSON.parse(read('package.json'))

    expect({ ...manifest.dependencies, ...manifest.devDependencies }).not.toHaveProperty('drizzle-kit')
    expect(readdirSync(root).filter((name) => name.startsWith('drizzle.config'))).toEqual([])
    expect(existsSync(`${root}/node_modules/.bin/drizzle-kit`)).toBe(false)
  })

  it.each(['README.md', '.context/qadb-onboarding.md'])('is not told to push by %s', (path) => {
    expect(read(path)).not.toMatch(/drizzle-kit push\b(?!`? (can|must))|drizzle\.config/)
  })
})
