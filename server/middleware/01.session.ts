export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event)
  if (user) {
    event.context.user = user
  }
})
