<script setup lang="ts">
import { ToggleGroupItem } from 'reka-ui'

/** One choice of a `ChipGroup`, which holds what is chosen. */
defineProps<{ value: string; color?: string; disabled?: boolean }>()
</script>

<template>
  <ToggleGroupItem
    class="chip"
    :class="{ off: disabled }"
    :value="value"
    :disabled="disabled"
    :style="color ? { '--cv': color } : undefined"
  >
    <slot />
  </ToggleGroupItem>
</template>
