<script setup lang="ts">
withDefaults(
  defineProps<{
    width?: string
    height?: string
    radius?: string
  }>(),
  { height: '14px' },
)
</script>

<template>
  <div class="skeleton" :style="{ width, height, borderRadius: radius }" />
</template>
