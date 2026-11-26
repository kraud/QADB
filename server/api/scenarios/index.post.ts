import { scenarioInputSchema } from '#shared/scenario/schema'
import { createScenario } from '../../services/scenarios'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const parsed = scenarioInputSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: parsed.error.issues })
  }
  return createScenario(db, user.id, parsed.data)
})
