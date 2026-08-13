import { and, eq } from 'drizzle-orm'
import { questions } from '../../../db/schema'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!

  const owned = await db
    .select({ id: questions.id })
    .from(questions)
    .where(and(eq(questions.id, id), eq(questions.user_id, user.id)))
    .limit(1)
  if (owned.length === 0) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  await db.delete(questions).where(eq(questions.id, id))

  setResponseStatus(event, 204)
  return null
})
