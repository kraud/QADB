import { eq } from 'drizzle-orm'
import { questions } from '../../../db/schema'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const rows = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.user_id, user.id))
    .orderBy(questions.created_at)
  return rows
})
