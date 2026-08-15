import type { SQL } from 'drizzle-orm'
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import { questions } from '../../../db/schema'
import { CATEGORY } from '#shared/enums'
import { mapQuestionRow, withQuestionStats } from '../../utils/questions'

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string' && value.length > 0) return [value]
  return []
}

const DIFF_CASE = sql`case ${questions.difficulty} when 'easy' then 1 when 'medium' then 2 when 'hard' then 3 else 4 end`
const IMP_CASE = sql`case ${questions.importance} when 'low' then 1 when 'mid' then 2 when 'high' then 3 else 4 end`

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const query = getQuery(event)

  const difficulty = asStringArray(query.difficulty)
  const importance = asStringArray(query.importance)
  const category = asStringArray(query.category).filter((v) => (CATEGORY as readonly string[]).includes(v))
  const nbd = query.nbd === 'true' ? true : query.nbd === 'false' ? false : undefined
  const mastered = query.mastered === 'true' ? true : query.mastered === 'false' ? false : undefined
  const amountOp = query.amountOp === 'gt' || query.amountOp === 'lt' || query.amountOp === 'eq' ? query.amountOp : undefined
  const amountValue = Number.parseInt(String(query.amountValue ?? ''), 10)
  const recentlyFailed = query.recentlyFailed === 'true'
  const q = typeof query.q === 'string' ? query.q.trim() : ''
  const sortKey = ['difficulty', 'importance', 'pct', 'amount'].includes(String(query.sortKey))
    ? (String(query.sortKey) as 'difficulty' | 'importance' | 'pct' | 'amount')
    : undefined
  const sortDir = query.sortDir === 'desc' ? 'desc' : 'asc'
  const stats = withQuestionStats()

  const conditions: SQL[] = [
    eq(questions.user_id, user.id),
  ]
  if (difficulty.length) conditions.push(inArray(questions.difficulty, difficulty))
  if (importance.length) conditions.push(inArray(questions.importance, importance))
  if (category.length) {
    conditions.push(
      sql`exists (select 1 from json_each(${questions.category}) where json_each.value in (${sql.join(category.map((v) => sql`${v}`), sql`, `)}))`,
    )
  }
  if (nbd === true) conditions.push(isNull(stats.attemptCount))
  if (nbd === false) conditions.push(isNotNull(stats.attemptCount))
  if (mastered === true) conditions.push(eq(questions.mastered, 1))
  if (mastered === false) conditions.push(eq(questions.mastered, 0))
  if (amountOp && !Number.isNaN(amountValue)) {
    const amountCount = sql<number>`coalesce(${stats.attemptCount}, 0)`
    if (amountOp === 'gt') conditions.push(gt(amountCount, amountValue))
    else if (amountOp === 'lt') conditions.push(lt(amountCount, amountValue))
    else conditions.push(eq(amountCount, amountValue))
  }
  if (recentlyFailed) {
    conditions.push(and(eq(stats.lastCorrect, 0), isNotNull(stats.attemptCount))!)
  }
  if (q) {
    for (const token of q.split(/\s+/).filter(Boolean)) {
      const escaped = token.replace(/[!%_]/g, (c) => '!' + c)
      conditions.push(sql`${questions.question} like ${`%${escaped}%`} escape '!'`)
    }
  }

  const tiebreak = [asc(questions.created_at), asc(questions.id)]
  let orderBy
  if (sortKey === 'difficulty') {
    orderBy = [sortDir === 'desc' ? desc(DIFF_CASE) : asc(DIFF_CASE), ...tiebreak]
  } else if (sortKey === 'importance') {
    orderBy = [sortDir === 'desc' ? desc(IMP_CASE) : asc(IMP_CASE), ...tiebreak]
  } else if (sortKey === 'pct') {
    const pct = sql<number | null>`case when coalesce(${stats.attemptCount}, 0) = 0 then null else (coalesce(${stats.correctCount}, 0) * 100.0 / ${stats.attemptCount}) end`
    orderBy = [sortDir === 'desc' ? desc(pct) : asc(pct), ...tiebreak]
  } else if (sortKey === 'amount') {
    const amount = sql<number>`coalesce(${stats.attemptCount}, 0)`
    orderBy = [sortDir === 'desc' ? desc(amount) : asc(amount), ...tiebreak]
  } else {
    orderBy = tiebreak
  }

  const rows = await db
    .select({
      id: questions.id,
      question: questions.question,
      answer_summary: questions.answer_summary,
      difficulty: questions.difficulty,
      importance: questions.importance,
      category: questions.category,
      link: questions.link,
      mastered: questions.mastered,
      created_at: questions.created_at,
      updated_at: questions.updated_at,
      attemptCount: stats.attemptCount,
      correctCount: stats.correctCount,
      lastAnsweredAt: stats.lastAnsweredAt,
      lastCorrect: stats.lastCorrect,
    })
    .from(questions)
    .leftJoin(stats, eq(questions.id, stats.questionId))
    .where(and(...conditions))
    .orderBy(...orderBy)

  return rows.map(mapQuestionRow)
})
