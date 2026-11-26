<script setup lang="ts">
import { RadioGroupItem, RadioGroupRoot } from 'reka-ui'

defineProps<{
  options: { value: string; label: string }[]
  modelValue?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>

<template>
  <!-- `null`, unlike `undefined`, keeps Reka following us while nothing is chosen. -->
  <RadioGroupRoot
    class="seg"
    orientation="horizontal"
    :model-value="modelValue ?? null"
    @update:model-value="emit('update:modelValue', String($event))"
  >
    <RadioGroupItem v-for="opt in options" :key="opt.value" :value="opt.value">
      {{ opt.label }}
    </RadioGroupItem>
  </RadioGroupRoot>
</template>
