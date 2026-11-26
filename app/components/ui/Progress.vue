<script setup lang="ts">
import { ProgressIndicator, ProgressRoot } from 'reka-ui'

defineProps<{ value: number; max: number }>()
</script>

<template>
  <ProgressRoot class="progress-bar" :model-value="value" :max="max">
    <ProgressIndicator class="fill" :style="{ width: `${max ? Math.round((value / max) * 100) : 0}%` }" />
  </ProgressRoot>
</template>
