<script setup lang="ts">
// An address from before scenarios: `/` knows where to go now.
definePageMeta({
  layout: false,
  middleware: () => navigateTo('/', { redirectCode: 302, replace: true }),
})
</script>

<template>
  <div />
</template>
