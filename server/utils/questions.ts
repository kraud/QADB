import { count, max, sql, sum } from 'drizzle-orm'
import type { QuestionWithStats } from '#shared/types/qadb'
import { CATEGORY } from '#shared/enums'
import { attempts } from '../../db/schema'

type StatColumns = {
  attemptCount: number | null
  correctCount: number | null
  lastAnsweredAt: number | null
  lastCorrect: number | null
}

type QuestionColumns = {
  id: string
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

/** Aggregate attempt stats per question, LEFT JOINed onto `questions` by callers. */
export function withQuestionStats() {
  return db
    .select({
      questionId: attempts.question_id,
      attemptCount: count(attempts.id).as('attemptCount'),
      correctCount: sum(attempts.correct).mapWith(Number).as('correctCount'),
      lastAnsweredAt: max(attempts.answered_at).as('lastAnsweredAt'),
      lastCorrect: sql<number | null>`(
        select a.correct from attempts a
        where a.question_id = attempts.question_id
        order by a.answered_at desc
        limit 1
      )`.as('lastCorrect'),
    })
    .from(attempts)
    .groupBy(attempts.question_id)
    .as('qstats')
}

/** Decodes a JSON category array column into valid values; malformed rows yield `[]`. */
function parseCategories(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string' && (CATEGORY as readonly string[]).includes(v))
  } catch {
    return []
  }
}

/** Shapes a joined `questions` + stats row into the wire format (computed pct, null-safe counts). */
export function mapQuestionRow(row: QuestionColumns & Partial<StatColumns>): QuestionWithStats {
  const attemptCount = row.attemptCount ?? 0
  const correctCount = row.correctCount ?? 0
  const trackRecordPct = attemptCount > 0 ? (correctCount * 100) / attemptCount : null

  return {
    id: row.id,
    question: row.question,
    answer_summary: row.answer_summary,
    difficulty: row.difficulty,
    importance: row.importance,
    category: parseCategories(row.category),
    link: row.link,
    mastered: row.mastered,
    created_at: row.created_at,
    updated_at: row.updated_at,
    stats: {
      attemptCount,
      correctCount,
      trackRecordPct,
      lastAnsweredAt: row.lastAnsweredAt ?? null,
      lastCorrect: row.lastCorrect ?? null,
    },
  }
}
