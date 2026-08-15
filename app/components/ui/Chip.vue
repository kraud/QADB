<script setup lang="ts">
defineProps<{ active?: boolean; color?: string; disabled?: boolean }>()
defineEmits<{ (e: 'click'): void }>()
</script>

<template>
  <button
    type="button"
    class="chip"
    :class="{ on: active, off: disabled }"
    :disabled="disabled"
    :aria-disabled="disabled"
    :style="color ? { '--cv': color } : undefined"
    @click="$emit('click')"
  >
    <slot />
  </button>
</template>
