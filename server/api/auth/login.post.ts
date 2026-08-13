import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '../../../db/schema'

const bodySchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Validation failed' })
  }

  const { username, password } = parsed.data

  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1)
  const user = rows[0]

  if (!user || !(await verifyPassword(user.password_hash, password))) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  await setUserSession(event, { user: { id: user.id, username: user.username } })

  return { id: user.id, username: user.username }
})
