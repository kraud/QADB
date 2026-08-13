<script setup lang="ts">
const { loggedIn } = useUserSession()
await navigateTo(loggedIn.value ? '/content' : '/login', { redirectCode: 302 })
</script>

<template>
  <div />
</template>
