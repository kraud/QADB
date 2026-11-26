import type { ScenarioInput } from './schema'
import type { Attribute, Option, Scenario, Usage } from './types'

/** The user's choices for the destructive parts of a scenario edit. */
export interface Resolutions {
  /** By removed option id. `moveTo` is a kept option's id, a new option's `ref`, or null to leave empty. */
  removedOptions?: Record<string, { moveTo: string | null }>
  /** Attribute ids whose removal the user confirmed. */
  removedAttributes?: string[]
  /** Attribute ids whose change from multiple to single selection the user confirmed. */
  collapseToSingle?: string[]
}

/** A destructive change that questions are affected by and that has no choice yet. */
export type Conflict =
  | { type: 'option-in-use'; attributeId: string; optionId: string; count: number }
  | { type: 'attribute-delete'; attributeId: string; count: number }
  | { type: 'multiple-to-single'; attributeId: string; count: number }

export interface ScenarioDiff {
  /** Current attributes that the new version drops, with all their options. */
  removedAttributes: Attribute[]
  /** Options dropped from attributes that stay. */
  removedOptions: { attribute: Attribute; option: Option }[]
  /** Attributes changing from multiple to single selection. */
  collapsed: Attribute[]
}

/** What saving `next` over `current` takes away. Attributes and options are matched by id. */
export function diffScenario(current: Scenario, next: ScenarioInput): ScenarioDiff {
  const diff: ScenarioDiff = { removedAttributes: [], removedOptions: [], collapsed: [] }
  const kept = new Map(next.attributes.map((attribute) => [attribute.id, attribute]))

  for (const attribute of current.attributes) {
    const updated = kept.get(attribute.id)
    if (!updated) {
      diff.removedAttributes.push(attribute)
      continue
    }
    const keptOptions = new Set(updated.options.map((option) => option.id))
    for (const option of attribute.options) {
      if (!keptOptions.has(option.id)) diff.removedOptions.push({ attribute, option })
    }
    if (attribute.selectionMode === 'multiple' && updated.selectionMode === 'single') diff.collapsed.push(attribute)
  }
  return diff
}

/** The destructive changes that affect questions and that `r` does not settle. */
export function findConflicts(current: Scenario, next: ScenarioInput, usage: Usage, r: Resolutions): Conflict[] {
  const diff = diffScenario(current, next)
  const conflicts: Conflict[] = [
    ...diff.removedAttributes
      .filter((attribute) => !r.removedAttributes?.includes(attribute.id))
      .map((attribute) => ({
        type: 'attribute-delete' as const,
        attributeId: attribute.id,
        count: usage.attributeCounts[attribute.id] ?? 0,
      })),
    ...diff.removedOptions
      .filter(({ option }) => !Object.hasOwn(r.removedOptions ?? {}, option.id))
      .map(({ attribute, option }) => ({
        type: 'option-in-use' as const,
        attributeId: attribute.id,
        optionId: option.id,
        count: usage.optionCounts[option.id] ?? 0,
      })),
    ...diff.collapsed
      .filter((attribute) => !r.collapseToSingle?.includes(attribute.id))
      .map((attribute) => ({
        type: 'multiple-to-single' as const,
        attributeId: attribute.id,
        count: usage.multiValueCounts[attribute.id] ?? 0,
      })),
  ]
  return conflicts.filter((conflict) => conflict.count > 0)
}
