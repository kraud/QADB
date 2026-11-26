<script setup lang="ts">
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, VisuallyHidden } from 'reka-ui'

/**
 * A dialog that never closes itself: Escape and a click on the backdrop only ask (`close`), so the
 * owner can keep it open, for instance over unsaved changes.
 */
withDefaults(
  defineProps<{
    open?: boolean
    role?: 'dialog' | 'alertdialog'
    ariaLabel?: string
    maxWidth?: string
  }>(),
  { role: 'dialog' },
)
const emit = defineEmits<{ (e: 'close'): void }>()

// There is no trigger button for Reka to go back to: remember what had the focus.
let opener: HTMLElement | null = null

/** The first field, or the first control where there is none. */
async function focusFirst(event: Event) {
  event.preventDefault()
  const dialog = event.target as HTMLElement
  opener = document.activeElement as HTMLElement | null
  await nextTick()
  const first =
    dialog.querySelector<HTMLElement>('input:enabled, textarea:enabled') ??
    dialog.querySelector<HTMLElement>('button:enabled, a[href]')
  ;(first ?? dialog)?.focus()
}

function focusOpener(event: Event) {
  event.preventDefault()
  if (opener?.isConnected) opener.focus()
}

/**
 * A button that disables itself (while saving) drops the focus to the page, where Reka no longer
 * hears Tab: the topmost dialog takes it back.
 */
function keepTab(event: KeyboardEvent) {
  const at = document.activeElement
  if (event.key !== 'Tab' || !(at === document.body || at?.matches(':disabled'))) return
  const dialog = [...document.querySelectorAll<HTMLElement>('.overlay > .modal')].at(-1)
  if (!dialog) return
  event.preventDefault()
  dialog.focus()
}

onMounted(() => document.addEventListener('keydown', keepTab))
onBeforeUnmount(() => document.removeEventListener('keydown', keepTab))
</script>

<template>
  <DialogRoot :open="open" @update:open="$event || emit('close')">
    <DialogPortal>
      <DialogOverlay class="overlay">
        <DialogContent
          class="modal"
          :role="role"
          aria-modal="true"
          :aria-label="ariaLabel"
          :aria-describedby="undefined"
          :style="maxWidth ? { maxWidth } : undefined"
          @open-auto-focus="focusFirst"
          @close-auto-focus="focusOpener"
        >
          <VisuallyHidden as-child>
            <DialogTitle as="span">{{ ariaLabel }}</DialogTitle>
          </VisuallyHidden>
          <slot />
        </DialogContent>
      </DialogOverlay>
    </DialogPortal>
  </DialogRoot>
</template>
