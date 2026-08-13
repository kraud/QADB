<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: 'diff' | 'imp' | 'cat' | 'mastered' | 'neutral'
    color?: string
  }>(),
  { tone: 'neutral' },
)
</script>

<template>
  <span class="badge" :class="`badge-${tone}`" :style="color ? { '--bd': color } : undefined">
    <slot />
  </span>
</template>
