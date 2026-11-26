import { z } from 'zod'
import { deleteScenario } from '../../../services/scenarios'

const bodySchema = z.object({ confirmName: z.string() })

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: parsed.error.issues })
  }
  await deleteScenario(db, user.id, getRouterParam(event, 'sid')!, parsed.data.confirmName)

  setResponseStatus(event, 204)
  return null
})
