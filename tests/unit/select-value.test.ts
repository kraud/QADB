import { describe, expect, it } from 'vitest'
import { fromItemValue, toItemValue } from '~/utils/select-value'

describe('select values', () => {
  it.each(['', 'k3j9x0q1', '>', 'attr:k3j9x0q1'])('round-trips %j', (value) => {
    expect(fromItemValue(toItemValue(value))).toBe(value)
  })

  it('never hands Reka an empty item value', () => {
    expect(toItemValue('')).not.toBe('')
  })
})
