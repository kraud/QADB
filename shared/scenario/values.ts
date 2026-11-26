import type { AttributeValues, Scenario } from './types'

export interface ValueIssue {
  path: ['values', string]
  message: string
}

/** The values a new question starts with: each attribute's default options, if any. */
export function defaultValues(scenario: Scenario): AttributeValues {
  return Object.fromEntries(
    scenario.attributes.map((attribute) => [
      attribute.id,
      attribute.options.filter((option) => option.isDefault).map((option) => option.id),
    ]),
  )
}

/** Required attributes without an option. A question with any of these is incomplete. */
export function missingAttributeIds(scenario: Scenario, values: AttributeValues): string[] {
  return scenario.attributes
    .filter((attribute) => attribute.required && !values[attribute.id]?.length)
    .map((attribute) => attribute.id)
}

/** Checks values against the scenario definition; `requireAll` also demands every required attribute. */
export function validateValues(scenario: Scenario, values: AttributeValues, opts: { requireAll: boolean }): ValueIssue[] {
  const issues: ValueIssue[] = []
  const issue = (attributeId: string, message: string) => issues.push({ path: ['values', attributeId], message })
  const attributes = new Map(scenario.attributes.map((attribute) => [attribute.id, attribute]))

  for (const [attributeId, optionIds] of Object.entries(values)) {
    const attribute = attributes.get(attributeId)
    if (!attribute) {
      issue(attributeId, 'Unknown attribute')
      continue
    }
    const known = new Set(attribute.options.map((option) => option.id))
    if (optionIds.some((id) => !known.has(id))) issue(attributeId, `Unknown option for ${attribute.name}`)
    else if (new Set(optionIds).size !== optionIds.length) issue(attributeId, `${attribute.name} lists an option twice`)
    else if (attribute.selectionMode === 'single' && optionIds.length > 1) {
      issue(attributeId, `${attribute.name} takes only one option`)
    }
  }

  if (opts.requireAll) {
    for (const attributeId of missingAttributeIds(scenario, values)) {
      issue(attributeId, `${attributes.get(attributeId)!.name} is required`)
    }
  }
  return issues
}
