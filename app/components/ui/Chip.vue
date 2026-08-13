<script setup lang="ts">
defineProps<{ active?: boolean; color?: string }>()
defineEmits<{ (e: 'click'): void }>()
</script>

<template>
  <button
    type="button"
    class="chip"
    :class="{ on: active }"
    :data-variant="color ? '' : null"
    :style="color ? { '--cv': color } : undefined"
    @click="$emit('click')"
  >
    <slot />
  </button>
</template>
