// A scenario with one attribute of each kind, for the question API tests.
import { expect } from 'vitest'
import type { ScenarioInput } from '../../shared/scenario/schema'
import type { Scenario } from '../../shared/scenario/types'
import type { AuthUser } from '../../server/utils/auth'
import type { ApiTest } from './api-app'

const option = (label: string, isDefault = false) => ({ label, color: 'green' as const, isDefault })

/** A required ordered attribute, a required multiple one and an optional unordered one. */
export function questionScenarioInput(name = 'Frontend'): ScenarioInput {
  return {
    name,
    attributes: [
      {
        name: 'Level',
        selectionMode: 'single',
        ordered: true,
        required: true,
        options: [option('Easy'), option('Medium', true), option('Hard')],
      },
      {
        name: 'Topic',
        selectionMode: 'multiple',
        ordered: false,
        required: true,
        options: [option('HTML'), option('CSS'), option('JS')],
      },
      { name: 'Region', selectionMode: 'single', ordered: false, required: false, options: [option('EU'), option('US')] },
    ],
  }
}

export async function createQuestionScenario(api: ApiTest, user: AuthUser, name?: string) {
  const res = await api.as(user)('post', '/api/scenarios', questionScenarioInput(name))
  expect(res.status, JSON.stringify(res.data)).toBe(200)
  const scenario: Scenario = res.data

  const [level, topic, region] = scenario.attributes.map((attribute) => attribute.id) as [string, string, string]
  /** Option ids by label. */
  const ids: Record<string, string> = Object.fromEntries(
    scenario.attributes.flatMap((attribute) => attribute.options.map((o) => [o.label, o.id])),
  )
  /** Attribute values naming exactly these options, with an entry for every attribute. */
  const values = (...labels: string[]) =>
    Object.fromEntries(
      scenario.attributes.map((attribute) => [
        attribute.id,
        attribute.options.filter((o) => labels.includes(o.label)).map((o) => o.id),
      ]),
    )

  return { scenario, sid: scenario.id, level, topic, region, ids, values }
}
