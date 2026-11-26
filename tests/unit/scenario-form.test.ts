import { describe, expect, it } from 'vitest'
import {
  addOption,
  buildResolutions,
  colorName,
  emptyForm,
  fieldErrors,
  move,
  moveTargets,
  newAttribute,
  setDefault,
  setSelectionMode,
  toForm,
} from '../../app/utils/scenario-form'
import { COLOR_KEYS } from '../../shared/scenario/colors'
import type { Conflict } from '../../shared/scenario/diff'
import { scenarioInputSchema } from '../../shared/scenario/schema'
import type { Scenario } from '../../shared/scenario/types'

const STORED: Scenario = {
  id: 's1',
  name: 'Finance',
  attributes: [
    {
      id: 'a1',
      name: 'Level',
      selectionMode: 'single',
      ordered: true,
      required: true,
      position: 0,
      options: [
        { id: 'o1', label: 'Low', color: 'green', position: 0, isDefault: false },
        { id: 'o2', label: 'High', color: 'red', position: 1, isDefault: true },
      ],
    },
  ],
}

/** An attribute with three named options, the flagged ones default. */
function attributeWith(selectionMode: 'single' | 'multiple', defaults: boolean[]) {
  const attribute = newAttribute()
  attribute.name = 'Topic'
  attribute.selectionMode = selectionMode
  addOption(attribute)
  attribute.options.forEach((option, i) => {
    option.label = `Option ${i}`
    option.isDefault = defaults[i]!
  })
  return attribute
}

describe('colorName', () => {
  it('names every palette key differently, in words', () => {
    expect(colorName('blue-1')).toBe('Blue 1')
    expect(colorName('red')).toBe('Red')
    expect(new Set(COLOR_KEYS.map(colorName)).size).toBe(COLOR_KEYS.length)
  })
})

describe('emptyForm', () => {
  it('has a blank name and no attributes', () => {
    expect(emptyForm()).toEqual({ name: '', attributes: [] })
  })

  it('is a new object each time', () => {
    emptyForm().attributes.push(newAttribute())
    expect(emptyForm().attributes).toEqual([])
  })
})

describe('toForm', () => {
  it('keeps every id and drops positions', () => {
    expect(toForm(STORED)).toEqual({
      name: 'Finance',
      attributes: [
        {
          id: 'a1',
          name: 'Level',
          selectionMode: 'single',
          ordered: true,
          required: true,
          options: [
            { id: 'o1', label: 'Low', color: 'green', isDefault: false },
            { id: 'o2', label: 'High', color: 'red', isDefault: true },
          ],
        },
      ],
    })
  })

  it('ignores the usage and counts of a scenario read on its own', () => {
    const detail = { ...STORED, usage: {}, questionCount: 3, incompleteCount: 1 }
    expect(Object.keys(toForm(detail))).toEqual(['name', 'attributes'])
  })

  it('does not share objects with the stored scenario', () => {
    const form = toForm(STORED)
    form.attributes[0]!.options[0]!.label = 'Changed'
    expect(STORED.attributes[0]!.options[0]!.label).toBe('Low')
  })
})

describe('newAttribute', () => {
  it('is single selection, unordered and optional, with 2 blank options', () => {
    const attribute = newAttribute()
    expect(attribute).toMatchObject({ name: '', selectionMode: 'single', ordered: false, required: false })
    expect(attribute.id).toBeUndefined()
    expect(attribute.options).toHaveLength(2)
    for (const option of attribute.options) {
      expect(option).toMatchObject({ label: '', isDefault: false })
      expect(option.id).toBeUndefined()
      expect(option.ref).toBeTruthy()
      expect(COLOR_KEYS).toContain(option.color)
    }
  })

  it('never repeats a ref', () => {
    const refs = [newAttribute(), newAttribute()].flatMap((a) => a.options.map((o) => o.ref))
    expect(new Set(refs).size).toBe(4)
  })

  it('gives each option its own color while the palette lasts', () => {
    const attribute = newAttribute()
    for (let i = attribute.options.length; i < COLOR_KEYS.length; i++) addOption(attribute)
    expect(new Set(attribute.options.map((o) => o.color)).size).toBe(COLOR_KEYS.length)
    addOption(attribute)
    expect(COLOR_KEYS).toContain(attribute.options.at(-1)!.color)
  })
})

describe('setSelectionMode', () => {
  it('clears ordered when switching to multiple, and keeps the defaults', () => {
    const attribute = attributeWith('single', [false, true, false])
    attribute.ordered = true
    setSelectionMode(attribute, 'multiple')
    expect(attribute).toMatchObject({ selectionMode: 'multiple', ordered: false })
    expect(attribute.options.map((o) => o.isDefault)).toEqual([false, true, false])
    expect(scenarioInputSchema.safeParse({ name: 'S', attributes: [attribute] }).success).toBe(true)
  })

  it('keeps only the first default when switching to single', () => {
    const attribute = attributeWith('multiple', [false, true, true])
    setSelectionMode(attribute, 'single')
    expect(attribute.selectionMode).toBe('single')
    expect(attribute.options.map((o) => o.isDefault)).toEqual([false, true, false])
  })

  it('does not switch ordered back on', () => {
    const attribute = attributeWith('single', [false, false, false])
    attribute.ordered = true
    setSelectionMode(attribute, 'multiple')
    setSelectionMode(attribute, 'single')
    expect(attribute.ordered).toBe(false)
  })
})

describe('setDefault', () => {
  it('moves the default in single selection', () => {
    const attribute = attributeWith('single', [true, false, false])
    setDefault(attribute, 2, true)
    expect(attribute.options.map((o) => o.isDefault)).toEqual([false, false, true])
    setDefault(attribute, 2, false)
    expect(attribute.options.map((o) => o.isDefault)).toEqual([false, false, false])
  })

  it('adds to the defaults in multiple selection', () => {
    const attribute = attributeWith('multiple', [true, false, false])
    setDefault(attribute, 2, true)
    expect(attribute.options.map((o) => o.isDefault)).toEqual([true, false, true])
  })
})

describe('move', () => {
  it('moves an entry up and down in place', () => {
    const list = ['a', 'b', 'c']
    move(list, 2, 1)
    expect(list).toEqual(['a', 'c', 'b'])
    move(list, 0, 1)
    expect(list).toEqual(['c', 'a', 'b'])
  })

  it('does nothing past either end', () => {
    const list = ['a', 'b']
    move(list, 0, -1)
    move(list, 1, 2)
    move(list, 5, 0)
    expect(list).toEqual(['a', 'b'])
  })
})

describe('fieldErrors', () => {
  it('names each field by its path', () => {
    const attribute = attributeWith('single', [false, false, false])
    attribute.options[1]!.label = 'option 0'
    const parsed = scenarioInputSchema.safeParse({
      name: ' ',
      attributes: [attribute, { ...newAttribute(), name: 'topic', options: [] }],
    })
    expect(fieldErrors(parsed.error!.issues)).toEqual({
      fields: {
        name: 'Enter a name',
        'attributes.0.options.1.label': 'Option labels must be unique',
        'attributes.1.name': 'Attribute names must be unique',
        'attributes.1.options': 'Add at least 2 options',
      },
      other: [],
    })
  })

  it('reads the paths of a rejected update, which start with "scenario"', () => {
    const issues = [{ path: ['scenario', 'attributes', 0, 'name'], message: 'Enter a name' }]
    expect(fieldErrors(issues).fields).toEqual({ 'attributes.0.name': 'Enter a name' })
  })

  it('keeps the first message of a field', () => {
    const issues = [
      { path: ['name'], message: 'First' },
      { path: ['name'], message: 'Second' },
    ]
    expect(fieldErrors(issues).fields).toEqual({ name: 'First' })
  })

  it('collects what no field shows', () => {
    const issues = [
      { path: ['scenario', 'attributes', 0, 'id'], message: 'Unknown attribute' },
      { path: ['resolutions', 'removedOptions', 'o1', 'moveTo'], message: 'Choose an option that stays in Level' },
      { path: ['attributes', 0, 'options', 1, 'isDefault'], message: 'Single selection allows one default' },
      { message: 'No path' },
    ]
    expect(fieldErrors(issues)).toEqual({
      fields: {},
      other: [
        'Unknown attribute',
        'Choose an option that stays in Level',
        'Single selection allows one default',
        'No path',
      ],
    })
  })
})

describe('moveTargets', () => {
  it('offers the kept options by id and the new ones by ref', () => {
    const next = toForm(STORED)
    const attribute = next.attributes[0]!
    attribute.options.splice(1, 1)
    addOption(attribute)
    attribute.options[1]!.label = ' Middle '
    expect(moveTargets(next, 'a1')).toEqual([
      { value: 'o1', label: 'Low' },
      { value: attribute.options[1]!.ref, label: 'Middle' },
    ])
  })

  it('is empty for an attribute that is gone', () => {
    expect(moveTargets(emptyForm(), 'a1')).toEqual([])
  })
})

describe('buildResolutions', () => {
  const conflicts: Conflict[] = [
    { type: 'option-in-use', attributeId: 'a1', optionId: 'o1', count: 2 },
    { type: 'option-in-use', attributeId: 'a1', optionId: 'o2', count: 1 },
    { type: 'attribute-delete', attributeId: 'a2', count: 3 },
    { type: 'multiple-to-single', attributeId: 'a3', count: 4 },
  ]

  it('turns the choices into resolutions, an empty target meaning "leave empty"', () => {
    expect(buildResolutions({}, conflicts, { o1: 'o3', o2: null })).toEqual({
      removedOptions: { o1: { moveTo: 'o3' }, o2: { moveTo: null } },
      removedAttributes: ['a2'],
      collapseToSingle: ['a3'],
    })
  })

  it('adds to the choices of an earlier round', () => {
    const first = buildResolutions({}, conflicts.slice(0, 1), { o1: 'o3' })
    const both = buildResolutions(first, conflicts.slice(1), { o2: null })
    expect(both).toEqual({
      removedOptions: { o1: { moveTo: 'o3' }, o2: { moveTo: null } },
      removedAttributes: ['a2'],
      collapseToSingle: ['a3'],
    })
  })
})
