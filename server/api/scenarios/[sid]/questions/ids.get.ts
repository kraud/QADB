import { listQuestionIds } from '../../../../services/questions'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return listQuestionIds(db, user.id, getRouterParam(event, 'sid')!)
})
