import { z } from 'zod'
import { updateQuestion } from '../../services/questions'

const bodySchema = z
  .object({
    question: z.string().trim().min(1).optional(),
    answer: z.string().trim().min(1).optional(),
    link: z.string().trim().max(2048).optional().nullable(),
    // Only the shape; the service checks the ids against the scenario.
    values: z.record(z.array(z.string())).optional(),
    mastered: z.union([z.literal(0), z.literal(1)]).optional(),
  })
  // An unknown field means a client of another version: saving only part of its edit would lose the rest.
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' })

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: parsed.error.issues })
  }
  return updateQuestion(db, user.id, getRouterParam(event, 'id')!, parsed.data)
})
