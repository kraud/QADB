import { z } from 'zod'
import { bulkEdit } from '../../../../services/bulk'

// Only the shape; the service checks the ids and the action against the scenario.
const bodySchema = z.object({
  questionIds: z.array(z.string()).min(1).max(2000),
  attributeId: z.string(),
  action: z.enum(['set', 'clear', 'add', 'replace', 'remove']),
  optionIds: z.array(z.string()),
})

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: parsed.error.issues })
  }
  return bulkEdit(db, user.id, getRouterParam(event, 'sid')!, parsed.data)
})
