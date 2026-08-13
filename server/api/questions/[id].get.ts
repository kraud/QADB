import { and, desc, eq } from 'drizzle-orm'
import { attempts, questions } from '../../../db/schema'
import { mapQuestionRow, withQuestionStats } from '../../utils/questions'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!

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
    .where(and(eq(questions.id, id), eq(questions.user_id, user.id)))
    .limit(1)

  const row = rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const history = await db
    .select({ id: attempts.id, correct: attempts.correct, answered_at: attempts.answered_at })
    .from(attempts)
    .where(eq(attempts.question_id, id))
    .orderBy(desc(attempts.answered_at), desc(attempts.id))

  return { ...mapQuestionRow(row), attempts: history }
})
