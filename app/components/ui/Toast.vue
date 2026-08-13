<script setup lang="ts">
const { toasts } = useToast()
</script>

<template>
  <div id="toast-root" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="toast">{{ t.text }}</div>
  </div>
</template>
