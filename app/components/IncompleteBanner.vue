<script setup lang="ts">
defineProps<{ count: number }>()
const emit = defineEmits<{ (e: 'show'): void }>()
</script>

<template>
  <section v-if="count > 0" class="alert incomplete-banner" aria-label="Incomplete questions">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
    <span><b>{{ count }}</b> incomplete question{{ count === 1 ? '' : 's' }}</span>
    <Btn variant="secondary" size="sm" @click="emit('show')">Show</Btn>
  </section>
</template>
