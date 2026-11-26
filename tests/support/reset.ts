// API-level setup for the e2e specs. Pass `page.request`, so the session cookie is shared with the browser.
import type { APIRequestContext, APIResponse } from '@playwright/test'
import type { AttemptRow, QuestionWithStats } from '../../shared/types/qadb'
import { loadTestUser } from './test-user'

export interface SeedQuestion {
  question: string
  answer?: string
  difficulty?: 'easy' | 'medium' | 'hard'
  importance?: 'low' | 'mid' | 'high'
  categories?: string[]
  mastered?: boolean
  /** Results to record, oldest first. */
  attempts?: boolean[]
}

async function json<T>(response: Promise<APIResponse>): Promise<T> {
  const res = await response
  if (!res.ok()) throw new Error(`API request failed: ${res.status()} ${res.url()}`)
  return (res.status() === 204 ? undefined : await res.json()) as T
}

/** Timestamps have millisecond precision and decide the order, so no two seeded rows may share one. */
async function passMillisecond(timestamp: number) {
  while (Date.now() <= timestamp) await new Promise((resolve) => setTimeout(resolve, 1))
}

/** Logs in as the test user and deletes all of its questions (and with them their attempts). */
export async function resetUserData(request: APIRequestContext) {
  await json(request.post('/api/auth/login', { data: loadTestUser() }))
  const questions = await json<{ id: string }[]>(request.get('/api/questions/ids'))
  for (const { id } of questions) {
    await json(request.delete(`/api/questions/${id}`))
  }
}

/** Creates one question, with its attempts. Questions list in the order they were seeded. */
export async function seedQuestion(request: APIRequestContext, seed: SeedQuestion) {
  const created = await json<QuestionWithStats>(
    request.post('/api/questions', {
      data: {
        question: seed.question,
        answer_summary: seed.answer ?? 'An answer.',
        difficulty: seed.difficulty ?? 'medium',
        importance: seed.importance ?? 'mid',
        category: seed.categories ?? ['JS'],
      },
    }),
  )
  await passMillisecond(created.created_at)

  if (seed.mastered) {
    await json(request.patch(`/api/questions/${created.id}`, { data: { mastered: 1 } }))
  }
  for (const correct of seed.attempts ?? []) {
    await json(request.post('/api/attempts', { data: { questionId: created.id, correct: correct ? 1 : 0 } }))
    await passMillisecond(Date.now())
  }
  return created.id
}

export async function seedQuestions(request: APIRequestContext, seeds: SeedQuestion[]) {
  const ids: string[] = []
  for (const seed of seeds) ids.push(await seedQuestion(request, seed))
  return ids
}

/** The stored question with its attempts, newest first. */
export function fetchQuestion(request: APIRequestContext, id: string) {
  return json<QuestionWithStats & { attempts: AttemptRow[] }>(request.get(`/api/questions/${id}`))
}
