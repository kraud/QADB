import { z } from 'zod'
import { recordAttempt } from '../services/questions'

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
  return recordAttempt(db, user.id, parsed.data.questionId, parsed.data.correct)
})
