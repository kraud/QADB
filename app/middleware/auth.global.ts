export default defineNuxtRouteMiddleware((to) => {
  if (to.path === '/login' || to.path === '/register' || to.path === '/') {
    return
  }

  const needsAuth =
    to.path === '/content' ||
    to.path.startsWith('/questions') ||
    to.path === '/practice' ||
    to.path.startsWith('/practice/')

  if (!needsAuth) return

  const { loggedIn } = useUserSession()
  if (!loggedIn.value) {
    return navigateTo('/login?expired=1', { redirectCode: 302 })
  }
})
