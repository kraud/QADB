<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'

defineProps<{
  modelValue?: boolean
  indeterminate?: boolean
  ariaLabel?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()
</script>

<template>
  <CheckboxRoot
    class="checkbox"
    :model-value="indeterminate ? 'indeterminate' : !!modelValue"
    :aria-label="ariaLabel"
    @update:model-value="emit('update:modelValue', $event === true)"
  >
    <CheckboxIndicator class="mark">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M4 12l6 6L20 6" /></svg>
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
