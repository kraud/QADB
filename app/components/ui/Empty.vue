<script setup lang="ts">
defineProps<{ title: string; text?: string }>()
</script>

<template>
  <div class="empty">
    <slot name="icon" />
    <h3>{{ title }}</h3>
    <p v-if="text">{{ text }}</p>
    <slot />
  </div>
</template>
