// The scenario editor's form: the same shape the server saves (`ScenarioInput`), edited in place.
import { COLOR_KEYS, type ColorKey } from '#shared/scenario/colors'
import type { Conflict, Resolutions } from '#shared/scenario/diff'
import type { ScenarioInput } from '#shared/scenario/schema'
import type { Scenario, SelectionMode } from '#shared/scenario/types'

export type AttributeForm = ScenarioInput['attributes'][number]
export type OptionForm = AttributeForm['options'][number]

/** The order new options take colors in: neighbors in it are easy to tell apart. */
const NEW_COLORS: ColorKey[] = [
  'blue-2',
  'orange',
  'green',
  'violet',
  'yellow',
  'cyan',
  'pink',
  'red',
  'gray-2',
  'blue-1',
  'blue-3',
  'gray-1',
  'gray-3',
]

/** The name a color is picked by: "blue-1" is "Blue 1". */
export function colorName(key: ColorKey): string {
  const words = key.replace('-', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function emptyForm(): ScenarioInput {
  return { name: '', attributes: [] }
}

/** A stored scenario as the form edits it. Order stands for position. */
export function toForm(scenario: Scenario): ScenarioInput {
  return {
    name: scenario.name,
    attributes: scenario.attributes.map(({ id, name, selectionMode, ordered, required, options }) => ({
      id,
      name,
      selectionMode,
      ordered: selectionMode === 'single' && ordered,
      required,
      options: options.map(({ id, label, color, isDefault }) => ({ id, label, color, isDefault })),
    })),
  }
}

/** A blank option. Until it is saved, requests refer to it by its `ref`. */
function newOption(taken: OptionForm[]): OptionForm {
  const used = new Set(taken.map((option) => option.color))
  const color = NEW_COLORS.find((key) => !used.has(key)) ?? NEW_COLORS[taken.length % COLOR_KEYS.length]!
  return { ref: `new-${Math.random().toString(36).slice(2, 12)}`, label: '', color, isDefault: false }
}

export function addOption(attribute: AttributeForm) {
  attribute.options.push(newOption(attribute.options))
}

export function newAttribute(): AttributeForm {
  const attribute: AttributeForm = {
    name: '',
    selectionMode: 'single',
    ordered: false,
    required: false,
    options: [],
  }
  addOption(attribute)
  addOption(attribute)
  return attribute
}

/** Single selection keeps only the first default; only single selection can be ordered. */
export function setSelectionMode(attribute: AttributeForm, mode: SelectionMode) {
  attribute.selectionMode = mode
  if (mode === 'multiple') {
    attribute.ordered = false
    return
  }
  const first = attribute.options.findIndex((option) => option.isDefault)
  attribute.options.forEach((option, index) => (option.isDefault = index === first))
}

export function setDefault(attribute: AttributeForm, index: number, isDefault: boolean) {
  attribute.options.forEach((option, i) => {
    if (i === index) option.isDefault = isDefault
    else if (isDefault && attribute.selectionMode === 'single') option.isDefault = false
  })
}

/** Moves one entry of the list to another place in it, if both places exist. */
export function move<T>(list: T[], from: number, to: number) {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return
  list.splice(to, 0, ...list.splice(from, 1))
}

/** The fields that show their own error. */
const FIELD = /^(name|attributes\.\d+\.(name|options|options\.\d+\.label))$/

/**
 * Sorts validation issues, from the schema or from the server, into one message per field of the
 * form and the messages no field shows.
 */
export function fieldErrors(issues: { path?: (string | number)[]; message: string }[]) {
  const fields: Record<string, string> = {}
  const other: string[] = []
  for (const { path = [], message } of issues) {
    // The body of an update wraps the form in `scenario`.
    const key = (path[0] === 'scenario' ? path.slice(1) : path).join('.')
    if (FIELD.test(key)) fields[key] ??= message
    else other.push(message)
  }
  return { fields, other }
}

/** The options questions can move to: the ones the attribute has after saving. */
export function moveTargets(next: ScenarioInput, attributeId: string): { value: string; label: string }[] {
  const attribute = next.attributes.find((candidate) => candidate.id === attributeId)
  return (attribute?.options ?? []).map((option) => ({
    value: option.id ?? option.ref!,
    label: option.label.trim(),
  }))
}

/**
 * The user's confirmation of these conflicts. `moveTo` gives, by removed option id, the option its
 * questions move to, or null to leave them empty.
 */
export function buildResolutions(conflicts: Conflict[], moveTo: Record<string, string | null>): Resolutions {
  const removedOptions: NonNullable<Resolutions['removedOptions']> = {}
  const removedAttributes: string[] = []
  const collapseToSingle: string[] = []
  for (const conflict of conflicts) {
    if (conflict.type === 'option-in-use') {
      removedOptions[conflict.optionId] = { moveTo: moveTo[conflict.optionId] ?? null }
    } else if (conflict.type === 'attribute-delete') {
      removedAttributes.push(conflict.attributeId)
    } else {
      collapseToSingle.push(conflict.attributeId)
    }
  }
  return { removedOptions, removedAttributes, collapseToSingle }
}
