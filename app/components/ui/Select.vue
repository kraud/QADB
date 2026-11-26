<script setup lang="ts">
import {
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'
import { fromItemValue, toItemValue } from '~/utils/select-value'

// Attributes such as `id` and `aria-label` belong on the button, not on a wrapper.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    modelValue?: string
    options: { value: string; label: string }[]
    placeholder?: string
    disabled?: boolean
    invalid?: boolean
    size?: 'md' | 'sm'
  }>(),
  { placeholder: 'Choose…', size: 'md' },
)
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const selected = computed(() => props.options.find((option) => option.value === props.modelValue))
// `null`, unlike `undefined`, keeps Reka following us when nothing is chosen.
const itemValue = computed(() => (selected.value ? toItemValue(selected.value.value) : null))

function choose(value: unknown) {
  if (typeof value === 'string') emit('update:modelValue', fromItemValue(value))
}
</script>

<template>
  <SelectRoot :model-value="itemValue" :disabled="disabled" @update:model-value="choose">
    <SelectTrigger v-bind="$attrs" class="select select-trigger" :class="{ sm: size === 'sm', invalid }">
      <!-- The label comes from our options, so the server renders it too. -->
      <SelectValue class="select-value">{{ selected?.label ?? placeholder }}</SelectValue>
      <SelectIcon class="select-chevron" as-child>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </SelectIcon>
    </SelectTrigger>

    <SelectPortal>
      <SelectContent class="select-content" position="popper" :side-offset="4" :collision-padding="8">
        <SelectScrollUpButton class="select-scroll">▴</SelectScrollUpButton>
        <SelectViewport class="select-viewport">
          <SelectItem
            v-for="option in options"
            :key="option.value"
            class="select-item"
            :value="toItemValue(option.value)"
          >
            <span class="select-check">
              <SelectItemIndicator>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M4 12l6 6L20 6" /></svg>
              </SelectItemIndicator>
            </span>
            <SelectItemText>{{ option.label }}</SelectItemText>
          </SelectItem>
        </SelectViewport>
        <SelectScrollDownButton class="select-scroll">▾</SelectScrollDownButton>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
