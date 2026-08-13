export default defineNuxtPlugin(() => {
  const stored = localStorage.getItem('qadb_theme')
  const { apply } = useTheme()
  apply(stored === 'dark' ? 'dark' : 'light')
})
