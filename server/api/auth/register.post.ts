import { eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { z } from 'zod'
import { users } from '../../../db/schema'

const bodySchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_-]+$/),
  password: z.string().min(8),
})

export default defineEventHandler(async (event) => {
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation failed',
      data: parsed.error.issues,
    })
  }

  const { username, password } = parsed.data

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1)

  if (existing.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'That username is already taken' })
  }

  const id = createId()
  const passwordHash = await hashPassword(password)

  await db.insert(users).values({ id, username, password_hash: passwordHash })

  await setUserSession(event, { user: { id, username } })

  return { id, username }
})
