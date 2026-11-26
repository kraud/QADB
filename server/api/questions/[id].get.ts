import { getQuestion } from '../../services/questions'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return getQuestion(db, user.id, getRouterParam(event, 'id')!)
})
