import { listScenarios } from '../../services/scenarios'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return listScenarios(db, user.id)
})
