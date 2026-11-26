<script setup lang="ts">
import { contentPath, randomPracticePath } from '~/utils/scenario-route'

const { user } = useUserSession()
const { toggle } = useTheme()
const practice = usePracticeStore()
const route = useRoute()
const { scenarios, pending, refresh } = useScenarios()

const sid = computed(() => (typeof route.params.sid === 'string' ? route.params.sid : ''))
/** The open scenario; undefined outside one, and for one that is not the user's. */
const current = computed(() => scenarios.value?.find((s) => s.id === sid.value))

// A scenario opened since the list was read is missing from it: read it again, once.
let refreshedFor = ''
onMounted(() => {
  watch(
    [sid, pending],
    () => {
      if (!sid.value || pending.value || current.value || refreshedFor === sid.value) return
      refreshedFor = sid.value
      refresh()
    },
    { immediate: true },
  )
})

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  practice.clear()
  await navigateTo('/login', { redirectCode: 302 })
}
</script>

<template>
  <header class="app-header">
    <div class="app-header-inner">
      <NuxtLink class="brand" to="/">QADB<span class="dot">.</span><small>question bank</small></NuxtLink>
      <nav class="header-nav">
        <NuxtLink v-if="current" class="nav-link" :to="contentPath(current.id)" :class="{ on: route.path === contentPath(current.id) }">Content</NuxtLink>
        <NuxtLink class="nav-link" to="/scenarios" :class="{ on: route.path === '/scenarios' }">Scenarios</NuxtLink>
      </nav>
      <ScenarioSwitcher :scenarios="scenarios ?? []" :current-id="current?.id" />
      <div class="header-right">
        <Btn v-if="current" :to="randomPracticePath(current.id)" aria-label="Random practice">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" style="width:15px;height:15px"><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8" cy="8" r="1" fill="currentColor" /><circle cx="16" cy="8" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="8" cy="16" r="1" fill="currentColor" /><circle cx="16" cy="16" r="1" fill="currentColor" /></svg>
          <span class="rand-label">Random Question</span>
        </Btn>
        <button class="icon-btn" aria-label="Toggle theme" @click="toggle">
          <!-- both icons are rendered: the server does not know the theme -->
          <svg class="theme-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          <svg class="theme-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
        </button>
        <div class="user-chip">
          <span class="avatar">{{ (user?.username?.[0] || '?').toLowerCase() }}</span>
          <span class="uname">{{ user?.username }}</span>
          <Btn variant="ghost" size="sm" @click="logout">Log out</Btn>
        </div>
      </div>
    </div>
  </header>
</template>
