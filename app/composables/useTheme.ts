import { ref } from 'vue'

const THEME_KEY = 'qadb_theme'

const theme = ref<'light' | 'dark'>('light')

function apply(value: 'light' | 'dark') {
  theme.value = value
  if (import.meta.client) {
    document.documentElement.dataset.theme = value
    localStorage.setItem(THEME_KEY, value)
  }
}

export function useTheme() {
  const toggle = () => apply(theme.value === 'light' ? 'dark' : 'light')
  return { theme, apply, toggle }
}
