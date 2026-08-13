import type { H3Event } from 'h3'

export interface AuthUser {
  id: string
  username: string
}

/** Reads the sealed session and returns the authenticated user, if any. */
export async function getSessionUser(event: H3Event): Promise<AuthUser | null> {
  const session = await getUserSession(event)
  const user = session.user as AuthUser | undefined
  if (user && user.id && user.username) {
    return { id: user.id, username: user.username }
  }
  return null
}

/** Requires `event.context.user` (set by `server/middleware/01.session.ts`). Throws 401 when absent. */
export async function requireUser(event: H3Event): Promise<AuthUser> {
  const user = (event.context as { user?: AuthUser }).user
  if (!user || !user.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  return user
}
