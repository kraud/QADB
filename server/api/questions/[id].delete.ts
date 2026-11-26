import { deleteQuestion } from '../../services/questions'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  await deleteQuestion(db, user.id, getRouterParam(event, 'id')!)

  setResponseStatus(event, 204)
  return null
})
