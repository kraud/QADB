// API-level setup for the e2e specs. Pass `page.request`, so the session cookie is shared with the browser.
import type { APIRequestContext } from '@playwright/test'
import type { Scenario } from '../../shared/scenario/types'
import type { AttemptRow, QuestionWithStats, ScenarioSummary } from '../../shared/types/qadb'
import { json, optionValues } from './scenario-fixture'
import { loadTestUser } from './test-user'

/** A question of the front-end scenario. */
export interface SeedQuestion {
  question: string
  answer?: string
  difficulty?: 'easy' | 'medium' | 'hard'
  importance?: 'low' | 'mid' | 'high'
  categories?: string[]
  link?: string
  mastered?: boolean
  /** Results to record, oldest first. */
  attempts?: boolean[]
}

const DIFFICULTY_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
const IMPORTANCE_LABELS = { low: 'Low', mid: 'Mid', high: 'High' }

/** Timestamps have millisecond precision and decide the order, so no two seeded rows may share one. */
async function passMillisecond(timestamp: number) {
  while (Date.now() <= timestamp) await new Promise((resolve) => setTimeout(resolve, 1))
}

/** Logs in as the test user and deletes all of its scenarios (and with them questions and attempts). */
export async function resetUserData(request: APIRequestContext) {
  await json(request.post('/api/auth/login', { data: loadTestUser() }))
  const scenarios = await json<ScenarioSummary[]>(request.get('/api/scenarios'))
  for (const scenario of scenarios) {
    await deleteScenario(request, scenario)
  }
}

export async function deleteScenario(request: APIRequestContext, { id, name }: { id: string; name: string }) {
  await json(request.delete(`/api/scenarios/${id}`, { data: { confirmName: name } }))
}

export async function deleteQuestion(request: APIRequestContext, id: string) {
  await json(request.delete(`/api/questions/${id}`))
}

/** Records one result, newer than every earlier one. */
export async function recordAttempt(request: APIRequestContext, questionId: string, correct: boolean) {
  await json(request.post('/api/attempts', { data: { questionId, correct: correct ? 1 : 0 } }))
  await passMillisecond(Date.now())
}

/** Creates one question, with its attempts. Questions list in the order they were seeded. */
export async function seedQuestion(request: APIRequestContext, scenario: Scenario, seed: SeedQuestion) {
  const created = await json<QuestionWithStats>(
    request.post(`/api/scenarios/${scenario.id}/questions`, {
      data: {
        question: seed.question,
        answer: seed.answer ?? 'An answer.',
        values: optionValues(scenario, {
          Difficulty: [DIFFICULTY_LABELS[seed.difficulty ?? 'medium']],
          Importance: [IMPORTANCE_LABELS[seed.importance ?? 'mid']],
          Category: seed.categories ?? ['JS'],
        }),
        link: seed.link,
      },
    }),
  )
  await passMillisecond(created.created_at)

  if (seed.mastered) {
    await json(request.patch(`/api/questions/${created.id}`, { data: { mastered: 1 } }))
  }
  for (const correct of seed.attempts ?? []) {
    await recordAttempt(request, created.id, correct)
  }
  return created.id
}

export async function seedQuestions(request: APIRequestContext, scenario: Scenario, seeds: SeedQuestion[]) {
  const ids: string[] = []
  for (const seed of seeds) ids.push(await seedQuestion(request, scenario, seed))
  return ids
}

/** The stored question with its attempts, newest first. */
export function fetchQuestion(request: APIRequestContext, id: string) {
  return json<QuestionWithStats & { attempts: AttemptRow[] }>(request.get(`/api/questions/${id}`))
}
