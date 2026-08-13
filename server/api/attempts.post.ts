import { createId } from '@paralleldrive/cuid2'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { attempts, questions } from '../../db/schema'
import { mapQuestionRow, withQuestionStats } from '../utils/questions'

const bodySchema = z.object({
  questionId: z.string().min(1),
  correct: z.union([z.literal(0), z.literal(1)]),
})

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Validation failed' })
  }

  const { questionId, correct } = parsed.data

  const owned = await db
    .select({ id: questions.id })
    .from(questions)
    .where(and(eq(questions.id, questionId), eq(questions.user_id, user.id)))
    .limit(1)
  if (owned.length === 0) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  await db.insert(attempts).values({
    id: createId(),
    question_id: questionId,
    user_id: user.id,
    correct,
    answered_at: Date.now(),
  })

  const stats = withQuestionStats()
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
    .where(eq(questions.id, questionId))
    .limit(1)

  return mapQuestionRow(rows[0]!)
})
