/** Everything else needs a session. */
const PUBLIC_PATHS = ['/', '/login', '/register']

export default defineNuxtRouteMiddleware((to) => {
  if (PUBLIC_PATHS.includes(to.path)) return

  const { loggedIn } = useUserSession()
  if (!loggedIn.value) {
    return navigateTo('/login?expired=1', { redirectCode: 302 })
  }
})
