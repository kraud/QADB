import { parseQuestionQuery } from '#shared/scenario/query'
import { listQuestions } from '../../../../services/questions'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return listQuestions(db, user.id, getRouterParam(event, 'sid')!, parseQuestionQuery(getQuery(event)))
})
