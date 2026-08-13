<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const route = useRoute()
const practice = usePracticeStore()

const username = ref('')
const password = ref('')
const submitting = ref(false)
const error = ref('')
const notice = ref(route.query.expired === '1' ? 'Your session expired — please log in again.' : '')
const fieldErrors = reactive({ username: '', password: '' })

const canSubmit = computed(() => username.value.trim().length > 0 && password.value.length > 0)
const { fetch: fetchSession } = useUserSession()

watch([username, password], () => {
  error.value = ''
  fieldErrors.username = ''
  fieldErrors.password = ''
})

async function submit() {
  fieldErrors.username = username.value.trim() ? '' : 'Enter your username.'
  fieldErrors.password = password.value ? '' : 'Enter your password.'
  if (fieldErrors.username || fieldErrors.password) return

  submitting.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { username: username.value.trim(), password: password.value },
    })
    await fetchSession()
    practice.clear()
    await navigateTo('/content')
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    error.value = status === 401 ? 'Invalid credentials' : 'Something went wrong. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="auth-card">
    <div class="auth-head">
      <div class="brand">QADB<span class="dot">.</span></div>
      <h1>Log in</h1>
      <p>Your frontend interview question bank</p>
    </div>

    <div v-if="notice" class="alert alert-info" style="margin-bottom: 14px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 8v4M12 16h.01" /><circle cx="12" cy="12" r="9" /></svg>
      <span>{{ notice }}</span>
    </div>

    <div v-if="error" class="alert alert-error" style="margin-bottom: 14px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
      <span>{{ error }}</span>
    </div>

    <form novalidate @submit.prevent="submit">
      <Input
        v-model="username"
        label="Username"
        name="username"
        autocomplete="username"
        :error="fieldErrors.username"
      />
      <Input
        v-model="password"
        label="Password"
        type="password"
        toggleable
        name="password"
        autocomplete="current-password"
        :error="fieldErrors.password"
      />
      <div class="auth-cta">
        <Btn type="submit" size="lg" :disabled="!canSubmit" :loading="submitting">Log in</Btn>
      </div>
    </form>

    <p class="auth-alt">Don't have an account? <NuxtLink to="/register">Register</NuxtLink></p>
  </div>
</template>
