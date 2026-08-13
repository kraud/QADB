<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    open?: boolean
    role?: 'dialog' | 'alertdialog'
    ariaLabel?: string
    maxWidth?: string
  }>(),
  { role: 'dialog' },
)
const emit = defineEmits<{ (e: 'close'): void }>()

const root = ref<HTMLElement | null>(null)

function trapFocus(e: KeyboardEvent) {
  if (e.key !== 'Tab') return
  const focusable = root.value?.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href]')
  if (!focusable || focusable.length === 0) return
  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
    return
  }
  trapFocus(e)
}

function onOverlayClick(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      nextTick(() => {
        root.value?.querySelector<HTMLElement>('input, textarea, select, button')?.focus()
      })
    }
  },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" ref="root" class="overlay" @click="onOverlayClick" @keydown="onKeydown">
      <div
        class="modal"
        :role="role"
        aria-modal="true"
        :aria-label="ariaLabel"
        :style="maxWidth ? { maxWidth } : undefined"
      >
        <slot />
      </div>
    </div>
  </Teleport>
</template>
