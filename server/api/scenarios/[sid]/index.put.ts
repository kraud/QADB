import { scenarioInputSchema } from '#shared/scenario/schema'
import { z } from 'zod'
import { updateScenario } from '../../../services/scenarios'

const resolutionsSchema = z.object({
  removedOptions: z.record(z.string(), z.object({ moveTo: z.string().min(1).nullable() })).optional(),
  removedAttributes: z.array(z.string()).optional(),
  collapseToSingle: z.array(z.string()).optional(),
})

const bodySchema = z.object({ scenario: scenarioInputSchema, resolutions: resolutionsSchema.default({}) })

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: parsed.error.issues })
  }
  return updateScenario(db, user.id, getRouterParam(event, 'sid')!, parsed.data.scenario, parsed.data.resolutions)
})
