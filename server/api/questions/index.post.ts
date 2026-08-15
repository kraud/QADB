import { createId } from '@paralleldrive/cuid2'
import { z } from 'zod'
import { questions } from '../../../db/schema'
import { categoriesSchema, difficultySchema, importanceSchema } from '#shared/enums'
import { mapQuestionRow } from '../../utils/questions'

const bodySchema = z.object({
  question: z.string().trim().min(1),
  answer_summary: z.string().trim().min(1),
  difficulty: difficultySchema,
  importance: importanceSchema,
  category: categoriesSchema,
  link: z.string().trim().max(2048).optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: parsed.error.issues })
  }

  const data = parsed.data
  const id = createId()
  const now = Date.now()
  const link = data.link?.trim() ? data.link.trim() : null

  await db.insert(questions).values({
    id,
    user_id: user.id,
    question: data.question,
    answer_summary: data.answer_summary,
    difficulty: data.difficulty,
    importance: data.importance,
    category: JSON.stringify(data.category),
    link,
    mastered: 0,
    created_at: now,
    updated_at: now,
  })

  return mapQuestionRow({
    id,
    question: data.question,
    answer_summary: data.answer_summary,
    difficulty: data.difficulty,
    importance: data.importance,
    category: JSON.stringify(data.category),
    link,
    mastered: 0,
    created_at: now,
    updated_at: now,
  })
})
