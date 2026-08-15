import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { questions } from '../../../db/schema'
import { categoriesSchema, difficultySchema, importanceSchema } from '#shared/enums'
import { mapQuestionRow, withQuestionStats } from '../../utils/questions'

const bodySchema = z
  .object({
    question: z.string().trim().min(1).optional(),
    answer_summary: z.string().trim().min(1).optional(),
    difficulty: difficultySchema.optional(),
    importance: importanceSchema.optional(),
    category: categoriesSchema.optional(),
    link: z.string().trim().max(2048).optional().nullable(),
    mastered: z.union([z.literal(0), z.literal(1)]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' })

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: parsed.error.issues })
  }

  const owned = await db
    .select({ id: questions.id })
    .from(questions)
    .where(and(eq(questions.id, id), eq(questions.user_id, user.id)))
    .limit(1)
  if (owned.length === 0) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const data = parsed.data
  const updates: Record<string, unknown> = { updated_at: Date.now() }
  if (data.question !== undefined) updates.question = data.question
  if (data.answer_summary !== undefined) updates.answer_summary = data.answer_summary
  if (data.difficulty !== undefined) updates.difficulty = data.difficulty
  if (data.importance !== undefined) updates.importance = data.importance
  if (data.category !== undefined) updates.category = JSON.stringify(data.category)
  if (data.link !== undefined) updates.link = data.link?.trim() ? data.link.trim() : null
  if (data.mastered !== undefined) updates.mastered = data.mastered

  await db.update(questions).set(updates).where(eq(questions.id, id))

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
    .where(eq(questions.id, id))
    .limit(1)

  return mapQuestionRow(rows[0]!)
})
