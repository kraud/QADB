<script setup lang="ts">
const { user } = useUserSession()
const { theme, toggle } = useTheme()
const practice = usePracticeStore()

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  practice.clear()
  await navigateTo('/login', { redirectCode: 302 })
}
</script>

<template>
  <header class="app-header">
    <div class="app-header-inner">
      <NuxtLink class="brand" to="/content">QADB<span class="dot">.</span><small>question bank</small></NuxtLink>
      <nav class="header-nav">
        <NuxtLink class="nav-link" to="/content" :class="{ on: $route.path === '/content' }">Content</NuxtLink>
      </nav>
      <div class="header-right">
        <Btn to="/practice/random" aria-label="Random practice">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" style="width:15px;height:15px"><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8" cy="8" r="1" fill="currentColor" /><circle cx="16" cy="8" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="8" cy="16" r="1" fill="currentColor" /><circle cx="16" cy="16" r="1" fill="currentColor" /></svg>
          Random Question
        </Btn>
        <button class="icon-btn" aria-label="Toggle theme" @click="toggle">
          <svg v-if="theme === 'light'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
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
