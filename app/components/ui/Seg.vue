<script setup lang="ts">
import { RadioGroupItem, RadioGroupRoot, ToggleGroupItem, ToggleGroupRoot } from 'reka-ui'

defineProps<{
  options: { value: string; label: string }[]
  modelValue?: string
  /**
   * Arrows only move, and a click, Enter or Space chooses. For a choice that changes other settings,
   * which moving across it must not do.
   */
  manual?: boolean
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

/** Picking the chosen one again would empty a toggle group: nothing changes. */
function pick(value: unknown) {
  if (value) emit('update:modelValue', String(value))
}
</script>

<template>
  <ToggleGroupRoot v-if="manual" class="seg" type="single" :model-value="modelValue ?? ''" @update:model-value="pick">
    <ToggleGroupItem v-for="opt in options" :key="opt.value" :value="opt.value">
      {{ opt.label }}
    </ToggleGroupItem>
  </ToggleGroupRoot>
  <!-- `null`, unlike `undefined`, keeps Reka following us while nothing is chosen. -->
  <RadioGroupRoot
    v-else
    class="seg"
    orientation="horizontal"
    :model-value="modelValue ?? null"
    @update:model-value="pick"
  >
    <RadioGroupItem v-for="opt in options" :key="opt.value" :value="opt.value">
      {{ opt.label }}
    </RadioGroupItem>
  </RadioGroupRoot>
</template>
