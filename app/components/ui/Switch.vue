<script setup lang="ts">
import { SwitchRoot } from 'reka-ui'

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    size?: 'md' | 'sm'
    color?: 'accent' | 'teal'
    label?: string
    ariaLabel?: string
    disabled?: boolean
  }>(),
  { size: 'md', color: 'accent' },
)
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

// It flips as soon as it is used, even where the new value is only stored after a request.
const checked = ref(!!props.modelValue)
watch(
  () => props.modelValue,
  (value) => (checked.value = !!value),
)

function change(value: unknown) {
  checked.value = value === true
  emit('update:modelValue', checked.value)
}
</script>

<template>
  <!-- The label around the button makes its text clickable and names it. -->
  <label class="switch" :class="{ sm: size === 'sm', teal: color === 'teal', disabled }">
    <SwitchRoot
      class="track"
      :model-value="checked"
      :disabled="disabled"
      :aria-label="ariaLabel"
      @update:model-value="change"
    />
    <span v-if="label || $slots.default"><slot>{{ label }}</slot></span>
  </label>
</template>
