<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue?: boolean
    size?: 'md' | 'sm'
    color?: 'accent' | 'teal'
    label?: string
    ariaLabel?: string
  }>(),
  { size: 'md', color: 'accent' },
)
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()
</script>

<template>
  <label class="switch" :class="{ sm: size === 'sm', teal: color === 'teal' }">
    <input
      type="checkbox"
      :checked="modelValue"
      :aria-label="ariaLabel"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span class="track" />
    <span v-if="label || $slots.default"><slot>{{ label }}</slot></span>
  </label>
</template>
