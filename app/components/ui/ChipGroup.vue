<script setup lang="ts">
import { ToggleGroupRoot } from 'reka-ui'

/** Chips sharing one Tab stop. The chosen values are a list in both modes. */
const props = defineProps<{ type: 'single' | 'multiple'; modelValue: string[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string[]): void }>()

// Reka wants a string for a single choice; '' is "none", where `undefined` would stop it following.
const value = computed(() => (props.type === 'single' ? (props.modelValue[0] ?? '') : props.modelValue))

function change(next: unknown) {
  if (Array.isArray(next)) emit('update:modelValue', next.map(String))
  else emit('update:modelValue', next ? [String(next)] : [])
}
</script>

<template>
  <ToggleGroupRoot class="chip-group" :type="type" :model-value="value" @update:model-value="change">
    <slot />
  </ToggleGroupRoot>
</template>
