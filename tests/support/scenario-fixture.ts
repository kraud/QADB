// The scenario the e2e specs run against: the one the migration builds from the old fixed fields.
import type { APIRequestContext, APIResponse } from '@playwright/test'
import type { ScenarioInput } from '../../shared/scenario/schema'
import type { AttributeValues, Scenario } from '../../shared/scenario/types'

type AttributeInput = ScenarioInput['attributes'][number]
type Color = AttributeInput['options'][number]['color']

export async function json<T>(response: Promise<APIResponse>): Promise<T> {
  const res = await response
  if (!res.ok()) throw new Error(`API request failed: ${res.status()} ${res.url()}`)
  return (res.status() === 204 ? undefined : await res.json()) as T
}

const option = (label: string, color: Color, isDefault = false) => ({ label, color, isDefault })

export const FRONTEND_SCENARIO: ScenarioInput = {
  name: 'Front-end interview questions',
  attributes: [
    {
      name: 'Difficulty',
      selectionMode: 'single',
      ordered: true,
      required: true,
      options: [option('Easy', 'blue-1'), option('Medium', 'blue-2', true), option('Hard', 'blue-3')],
    },
    {
      name: 'Importance',
      selectionMode: 'single',
      ordered: true,
      required: true,
      options: [option('Low', 'gray-1'), option('Mid', 'gray-2', true), option('High', 'gray-3')],
    },
    {
      name: 'Category',
      selectionMode: 'multiple',
      ordered: false,
      required: true,
      options: [
        option('HTML', 'orange'),
        option('CSS', 'cyan'),
        option('JS', 'yellow', true),
        option('API', 'violet'),
        option('React', 'green'),
        option('Domain', 'pink'),
      ],
    },
  ],
}

/** Creates a scenario for the user `request` is logged in as. */
export function createScenario(request: APIRequestContext, input: ScenarioInput) {
  return json<Scenario>(request.post('/api/scenarios', { data: input }))
}

/** The fixture matching the migrated scenario. */
export function createFrontendScenario(request: APIRequestContext): Promise<Scenario> {
  return createScenario(request, FRONTEND_SCENARIO)
}

/**
 * Adds an attribute with these option labels after the existing ones; the first option is the
 * default. A required one leaves every question already there incomplete.
 */
export function addAttribute(
  request: APIRequestContext,
  scenario: Scenario,
  attribute: { name: string; labels: string[]; required: boolean; selectionMode?: AttributeInput['selectionMode'] },
) {
  const added: AttributeInput = {
    name: attribute.name,
    selectionMode: attribute.selectionMode ?? 'single',
    ordered: false,
    required: attribute.required,
    options: attribute.labels.map((label, i) => option(label, 'green', i === 0)),
  }
  // Existing entries keep their ids, so the questions keep their values.
  const data = { scenario: { name: scenario.name, attributes: [...scenario.attributes, added] } }
  return json<Scenario>(request.put(`/api/scenarios/${scenario.id}`, { data }))
}

/** Attribute values naming exactly these options, with an entry for every attribute. */
export function optionValues(scenario: Scenario, labels: Record<string, string[]>): AttributeValues {
  const unknown = Object.keys(labels).filter((name) => !scenario.attributes.some((a) => a.name === name))
  if (unknown.length) throw new Error(`The scenario has no attribute ${unknown.join(', ')}`)

  return Object.fromEntries(
    scenario.attributes.map((attribute) => [
      attribute.id,
      (labels[attribute.name] ?? [])
        .map((label) => {
          const found = attribute.options.find((o) => o.label === label)
          if (!found) throw new Error(`${attribute.name} has no option ${label}`)
          return found
        })
        .sort((a, b) => a.position - b.position)
        .map((o) => o.id),
    ]),
  )
}
