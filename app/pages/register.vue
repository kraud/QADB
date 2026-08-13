<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { fetch: fetchSession } = useUserSession()
const practice = usePracticeStore()

const username = ref('')
const password = ref('')
const confirm = ref('')
const submitting = ref(false)
const errors = reactive({ username: '', password: '', confirm: '' })

const RE = /^[A-Za-z0-9_-]{3,32}$/

watch(username, () => {
  errors.username = ''
})

async function submit() {
  errors.username = RE.test(username.value.trim()) ? '' : '3–32 characters: letters, numbers, - and _'
  errors.password = password.value.length >= 8 ? '' : 'At least 8 characters'
  errors.confirm = confirm.value === password.value ? '' : "Passwords don't match."
  if (errors.username || errors.password || errors.confirm) return

  submitting.value = true
  try {
    await $fetch('/api/auth/register', {
      method: 'POST',
      body: { username: username.value.trim(), password: password.value },
    })
    await fetchSession()
    practice.clear()
    await navigateTo('/content')
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 409) {
      errors.username = 'That username is already taken'
    } else {
      errors.username = 'Something went wrong. Please try again.'
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="auth-card">
    <div class="auth-head">
      <div class="brand">QADB<span class="dot">.</span></div>
      <h1>Create account</h1>
      <p>One user, your own question bank</p>
    </div>

    <form novalidate @submit.prevent="submit">
      <Input
        v-model="username"
        label="Username"
        name="username"
        autocomplete="username"
        helper="3–32 characters: letters, numbers, - and _"
        :error="errors.username"
      />
      <Input
        v-model="password"
        label="Password"
        type="password"
        toggleable
        name="password"
        autocomplete="new-password"
        helper="At least 8 characters"
        :error="errors.password"
      />
      <Input
        v-model="confirm"
        label="Confirm password"
        type="password"
        name="confirm"
        autocomplete="new-password"
        :error="errors.confirm"
      />
      <div class="auth-cta">
        <Btn type="submit" size="lg" :loading="submitting">Create account</Btn>
      </div>
    </form>

    <p class="auth-alt">Already have an account? <NuxtLink to="/login">Log in</NuxtLink></p>
  </div>
</template>
