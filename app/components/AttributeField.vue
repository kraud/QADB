<script setup lang="ts">
import { colorVar } from '#shared/scenario/colors'
import type { Attribute } from '#shared/scenario/types'
import { orderedOptionIds } from '#shared/scenario/values'

/** More options than this do not fit a segmented control. */
const SEG_MAX = 4

const props = defineProps<{ attribute: Attribute; modelValue: string[]; error?: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string[]): void }>()

const single = computed(() => props.attribute.selectionMode === 'single')
const segmented = computed(() => single.value && props.attribute.options.length <= SEG_MAX)
const segOptions = computed(() => props.attribute.options.map((o) => ({ value: o.id, label: o.label })))

/** A required choice among several cannot be emptied once made. */
const locked = (id: string) =>
  !single.value && props.attribute.required && props.modelValue.length === 1 && props.modelValue[0] === id

function choose(id: string) {
  emit('update:modelValue', [id])
}

/**
 * The chips chosen after a click: a required attribute cannot be emptied, and the options of a
 * multiple one are kept in option order.
 */
function change(next: string[]) {
  if (!next.length && props.attribute.required) return
  emit('update:modelValue', single.value ? next : orderedOptionIds(props.attribute, next))
}
</script>

<template>
  <div class="field attr-field" :class="{ invalid: !!error }" role="group" :aria-label="attribute.name">
    <div class="attr-field-head">
      <label>{{ attribute.name }}</label>
      <Btn
        v-if="!attribute.required && modelValue.length"
        variant="ghost"
        size="sm"
        type="button"
        :aria-label="`Clear ${attribute.name}`"
        @click="emit('update:modelValue', [])"
      >
        Clear
      </Btn>
    </div>

    <Seg v-if="segmented" :model-value="modelValue[0]" :options="segOptions" @update:model-value="choose" />
    <ChipGroup
      v-else
      :type="attribute.selectionMode"
      :model-value="modelValue"
      @update:model-value="change"
    >
      <Chip
        v-for="option in attribute.options"
        :key="option.id"
        :value="option.id"
        :color="colorVar(option.color)"
        :disabled="locked(option.id)"
      >
        {{ option.label }}
      </Chip>
    </ChipGroup>

    <div v-if="error" class="field-err">{{ error }}</div>
  </div>
</template>
