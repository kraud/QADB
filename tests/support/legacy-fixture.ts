// The schema and a small data set as they were before scenarios, for testing the migration.
import { readFileSync } from 'node:fs'
import type { Client } from '@libsql/client/http'

export const LEGACY_SCHEMA = readFileSync(new URL('../../db/migrations/0000_baseline.sql', import.meta.url), 'utf8')

export const REMOVED_USERNAMES = [
  'qadb-verify-0817',
  'uitest',
  'fuzzsearch_test_2026',
  'verif_ta_814',
  'smoketest_260815',
]

export interface LegacyQuestion {
  id: string
  user_id: string
  question: string
  answer_summary: string
  difficulty: string
  importance: string
  category: string
  link: string | null
  mastered: number
  created_at: number
  updated_at: number
}

function question(n: number, overrides: Partial<LegacyQuestion>): LegacyQuestion {
  return {
    id: `q${n}`,
    user_id: 'u-kraud',
    question: `Question ${n}: what's "this"?`,
    answer_summary: `Answer ${n}\n\n- with **Markdown**; and ünïcode`,
    difficulty: 'medium',
    importance: 'mid',
    category: '["JS"]',
    link: null,
    mastered: 0,
    created_at: 1_700_000_000_000 + n,
    updated_at: 1_710_000_000_000 + n,
    ...overrides,
  }
}

/** Between them, `kraud`'s four questions use every option once or twice. */
export const KRAUD_QUESTIONS: LegacyQuestion[] = [
  question(1, { difficulty: 'easy', importance: 'low', category: '["HTML"]' }),
  question(2, { category: '["CSS","JS"]', link: 'https://example.com/two' }),
  question(3, { difficulty: 'hard', importance: 'high', category: '["API"]', mastered: 1 }),
  question(4, { category: '["React","Domain"]', link: '' }),
]

export const KRAUD_ATTEMPTS = [
  { id: 'a1', question_id: 'q1', user_id: 'u-kraud', correct: 1, answered_at: 1_720_000_000_001 },
  { id: 'a2', question_id: 'q1', user_id: 'u-kraud', correct: 0, answered_at: 1_720_000_000_002 },
  { id: 'a3', question_id: 'q2', user_id: 'u-kraud', correct: 1, answered_at: 1_720_000_000_003 },
  { id: 'a4', question_id: 'q3', user_id: 'u-kraud', correct: 1, answered_at: 1_720_000_000_004 },
  { id: 'a5', question_id: 'q4', user_id: 'u-kraud', correct: 0, answered_at: 1_720_000_000_005 },
]

export async function insertUser(client: Client, id: string, username: string) {
  await client.execute({
    sql: 'insert into users (id, username, password_hash, created_at) values (?, ?, ?, ?)',
    args: [id, username, `not-a-real-hash-${id}`, 1_690_000_000_000],
  })
}

export async function insertQuestion(client: Client, row: LegacyQuestion) {
  const columns = Object.keys(row)
  await client.execute({
    sql: `insert into questions (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
    args: Object.values(row),
  })
}

export async function insertAttempt(client: Client, row: (typeof KRAUD_ATTEMPTS)[number]) {
  await client.execute({
    sql: 'insert into attempts (id, question_id, user_id, correct, answered_at) values (?, ?, ?, ?, ?)',
    args: [row.id, row.question_id, row.user_id, row.correct, row.answered_at],
  })
}

/**
 * `kraud` (4 questions, 5 attempts), every account the migration removes (`uitest` also has a
 * question and an attempt) and `claude_test`, which has no questions.
 */
export async function seedLegacy(client: Client) {
  await client.executeMultiple(LEGACY_SCHEMA)
  await insertUser(client, 'u-kraud', 'kraud')
  await insertUser(client, 'u-empty', 'claude_test')
  for (const username of REMOVED_USERNAMES) await insertUser(client, `u-${username}`, username)

  for (const row of KRAUD_QUESTIONS) await insertQuestion(client, row)
  for (const row of KRAUD_ATTEMPTS) await insertAttempt(client, row)

  await insertQuestion(client, question(9, { user_id: 'u-uitest', category: '["CSS"]' }))
  await insertAttempt(client, {
    id: 'a9',
    question_id: 'q9',
    user_id: 'u-uitest',
    correct: 1,
    answered_at: 1_720_000_000_009,
  })
}
