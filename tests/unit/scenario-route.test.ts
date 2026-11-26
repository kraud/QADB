import { describe, expect, it } from 'vitest'
import { homePath } from '../../app/utils/scenario-route'

const two = [{ id: 'a' }, { id: 'b' }]

describe('homePath', () => {
  it('opens the last opened scenario', () => {
    expect(homePath(two, 'b')).toBe('/scenarios/b/content')
  })

  it('ignores a last id that is no longer there', () => {
    expect(homePath(two, 'gone')).toBe('/scenarios')
    expect(homePath([{ id: 'a' }], 'gone')).toBe('/scenarios/a/content')
  })

  it('opens the only scenario', () => {
    expect(homePath([{ id: 'a' }])).toBe('/scenarios/a/content')
  })

  it('lists the scenarios when there are several and none was opened', () => {
    expect(homePath(two)).toBe('/scenarios')
    expect(homePath(two, '')).toBe('/scenarios')
  })

  it('lists the scenarios when there are none', () => {
    expect(homePath([])).toBe('/scenarios')
    expect(homePath([], 'a')).toBe('/scenarios')
  })
})
