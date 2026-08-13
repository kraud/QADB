<script setup lang="ts">
defineProps<{
  options: { value: string; label: string }[]
  modelValue?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>

<template>
  <div class="seg">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      :class="{ on: modelValue === opt.value }"
      @click="emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>
