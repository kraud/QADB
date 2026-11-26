import { getScenario } from '../../../services/scenarios'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return getScenario(db, user.id, getRouterParam(event, 'sid')!)
})
