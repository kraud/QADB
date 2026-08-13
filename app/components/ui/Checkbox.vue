<script setup lang="ts">
defineProps<{
  modelValue?: boolean
  indeterminate?: boolean
  ariaLabel?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()
</script>

<template>
  <label class="checkbox">
    <input
      type="checkbox"
      :checked="modelValue"
      :indeterminate.prop="indeterminate"
      :aria-label="ariaLabel"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span class="box">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4 12l6 6L20 6" /></svg>
    </span>
  </label>
</template>
