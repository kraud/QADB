<script setup lang="ts">
import { COLOR_KEYS, colorVar, type ColorKey } from '#shared/scenario/colors'
import { colorName } from '~/utils/scenario-form'

defineProps<{ modelValue: ColorKey }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: ColorKey): void }>()

const root = ref<HTMLElement | null>(null)
const open = ref(false)

const trigger = () => root.value?.querySelector<HTMLElement>('.color-trigger')

async function toggle() {
  open.value = !open.value
  if (!open.value) return
  await nextTick()
  root.value?.querySelector<HTMLElement>('.color-menu [aria-pressed="true"]')?.focus()
}

function close() {
  open.value = false
  trigger()?.focus()
}

function choose(key: ColorKey) {
  emit('update:modelValue', key)
  close()
}

const outside = (target: EventTarget | null) => !!target && !root.value?.contains(target as Node)

/** A click elsewhere, or tabbing away, closes the colors. */
function onPointerDown(e: PointerEvent) {
  if (outside(e.target)) open.value = false
}

function onFocusOut(e: FocusEvent) {
  if (outside(e.relatedTarget)) open.value = false
}

watch(open, (value) => {
  if (value) document.addEventListener('pointerdown', onPointerDown)
  else document.removeEventListener('pointerdown', onPointerDown)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown))
</script>

<template>
  <div ref="root" class="color-picker" @focusout="onFocusOut" @keydown.esc="open && close()">
    <button
      type="button"
      class="color-trigger"
      aria-label="Color"
      :aria-expanded="open"
      :title="colorName(modelValue)"
      @click="toggle"
    >
      <span class="swatch" :style="{ background: colorVar(modelValue) }" />
    </button>
    <div v-if="open" class="color-menu" role="group" aria-label="Colors">
      <button
        v-for="key in COLOR_KEYS"
        :key="key"
        type="button"
        class="color-choice"
        :aria-label="colorName(key)"
        :aria-pressed="key === modelValue"
        :title="colorName(key)"
        @click="choose(key)"
      >
        <span class="swatch" :style="{ background: colorVar(key) }" />
      </button>
    </div>
  </div>
</template>
