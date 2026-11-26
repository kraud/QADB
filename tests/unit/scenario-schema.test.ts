import { describe, expect, it } from 'vitest'
import { COLOR_KEYS, colorVar } from '../../shared/scenario/colors'
import { scenarioInputSchema } from '../../shared/scenario/schema'

const option = (label: string, extra: Record<string, unknown> = {}) => ({ label, color: 'blue-1', isDefault: false, ...extra })

const attribute = (extra: Record<string, unknown> = {}) => ({
  name: 'Difficulty',
  selectionMode: 'single',
  ordered: false,
  required: false,
  options: [option('Easy'), option('Hard')],
  ...extra,
})

const scenario = (attributes: unknown[] = [attribute()], name: unknown = 'Finance') => ({ name, attributes })

/** Dotted issue paths; empty when the input is accepted. */
function issuePaths(input: unknown): string[] {
  const result = scenarioInputSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
}

describe('colors', () => {
  it('colorVar names the CSS variable of a palette key', () => {
    expect(colorVar('blue-1')).toBe('var(--c-blue-1)')
    expect(COLOR_KEYS).toEqual([
      'blue-1', 'blue-2', 'blue-3', 'gray-1', 'gray-2', 'gray-3',
      'orange', 'cyan', 'yellow', 'violet', 'green', 'pink', 'red',
    ])
  })
})

describe('scenarioInputSchema', () => {
  it('accepts a scenario with zero attributes', () => {
    expect(scenarioInputSchema.parse(scenario([]))).toEqual({ name: 'Finance', attributes: [] })
  })

  it('keeps ids and refs and trims names and labels', () => {
    const parsed = scenarioInputSchema.parse(scenario([
      attribute({
        id: 'a1',
        name: '  Level  ',
        options: [option('  Easy ', { id: 'o1' }), option('Hard', { ref: 'new-1' })],
      }),
    ], '  Finance  '))

    expect(parsed.name).toBe('Finance')
    expect(parsed.attributes[0]).toMatchObject({ id: 'a1', name: 'Level' })
    expect(parsed.attributes[0]!.options).toEqual([
      { id: 'o1', label: 'Easy', color: 'blue-1', isDefault: false },
      { ref: 'new-1', label: 'Hard', color: 'blue-1', isDefault: false },
    ])
  })

  it('rejects an attribute with fewer than 2 options', () => {
    expect(issuePaths(scenario([attribute({ options: [option('Easy')] })]))).toEqual(['attributes.0.options'])
    expect(issuePaths(scenario([attribute({ options: [] })]))).toEqual(['attributes.0.options'])
  })

  it('rejects ordered with multiple mode', () => {
    expect(issuePaths(scenario([attribute({ selectionMode: 'multiple', ordered: true })]))).toEqual(['attributes.0.ordered'])
    expect(issuePaths(scenario([attribute({ selectionMode: 'single', ordered: true })]))).toEqual([])
  })

  it('rejects two defaults in single mode', () => {
    const options = [option('Easy', { isDefault: true }), option('Hard', { isDefault: true })]

    expect(issuePaths(scenario([attribute({ options })]))).toEqual(['attributes.0.options.1.isDefault'])
  })

  it('allows several defaults in multiple mode', () => {
    const options = [option('Easy', { isDefault: true }), option('Hard', { isDefault: true })]

    expect(issuePaths(scenario([attribute({ selectionMode: 'multiple', options })]))).toEqual([])
  })

  it('rejects an unknown color or selection mode, pointing at the field', () => {
    expect(issuePaths(scenario([attribute({ options: [option('Easy', { color: 'teal' }), option('Hard')] })])))
      .toEqual(['attributes.0.options.0.color'])
    expect(issuePaths(scenario([attribute({ selectionMode: 'many' })]))).toEqual(['attributes.0.selectionMode'])
  })

  it('rejects blank, over-long and case-duplicate names and labels, including "Éasy"/"éasy"', () => {
    for (const blank of ['', '   ', ' \t']) {
      expect(issuePaths(scenario([], blank))).toEqual(['name'])
      expect(issuePaths(scenario([attribute({ name: blank })]))).toEqual(['attributes.0.name'])
      expect(issuePaths(scenario([attribute({ options: [option('Easy'), option(blank)] })])))
        .toEqual(['attributes.0.options.1.label'])
    }

    expect(issuePaths(scenario([], 'n'.repeat(81)))).toEqual(['name'])
    expect(issuePaths(scenario([attribute({ name: 'n'.repeat(81) })]))).toEqual(['attributes.0.name'])
    expect(issuePaths(scenario([attribute({ options: [option('Easy'), option('l'.repeat(41))] })])))
      .toEqual(['attributes.0.options.1.label'])

    expect(issuePaths(scenario([attribute({ name: 'Level' }), attribute({ name: '  LEVEL ' })])))
      .toEqual(['attributes.1.name'])
    for (const [first, second] of [['Easy', 'easy'], ['Easy', ' Easy  '], ['Éasy', 'éasy']]) {
      expect(issuePaths(scenario([attribute({ options: [option(first!), option(second!)] })])))
        .toEqual(['attributes.0.options.1.label'])
      expect(issuePaths(scenario([attribute({ name: first }), attribute({ name: second })])))
        .toEqual(['attributes.1.name'])
    }
  })

  it('accepts names at the limits, measured after trimming', () => {
    expect(issuePaths(scenario([
      attribute({ name: ` ${'a'.repeat(80)} `, options: [option(` ${'l'.repeat(40)} `), option('x')] }),
    ], ` ${'n'.repeat(80)} `))).toEqual([])
  })

  it('allows the same label in different attributes', () => {
    expect(issuePaths(scenario([attribute({ name: 'One' }), attribute({ name: 'Two' })]))).toEqual([])
  })

  it('reports a message for every field-level issue', () => {
    const result = scenarioInputSchema.safeParse(scenario([attribute({ name: 'Level' }), attribute({ name: 'level' })], ''))

    expect(result.success).toBe(false)
    expect(result.error!.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['name', 'Enter a name'],
      ['attributes.1.name', 'Attribute names must be unique'],
    ])
  })
})
