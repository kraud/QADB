import { z } from 'zod'
import { createQuestion } from '../../../../services/questions'

const bodySchema = z
  .object({
    question: z.string().trim().min(1),
    answer: z.string().trim().min(1),
    link: z.string().trim().max(2048).optional(),
    // Only the shape; the service checks the ids against the scenario.
    values: z.record(z.array(z.string())),
  })
  // An unknown field means a client of another version: saving only part of its input would lose the rest.
  .strict()

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: parsed.error.issues })
  }
  return createQuestion(db, user.id, getRouterParam(event, 'sid')!, parsed.data)
})
