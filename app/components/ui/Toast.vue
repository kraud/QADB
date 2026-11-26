<script setup lang="ts">
import { ToastProvider, ToastRoot, ToastTitle, ToastViewport, VisuallyHidden } from 'reka-ui'

const { toasts, dismiss } = useToast()
</script>

<template>
  <ToastProvider :duration="2400" swipe-direction="up" label="Notification">
    <ToastRoot
      v-for="t in toasts"
      :key="t.id"
      class="toast"
      type="background"
      @update:open="$event || dismiss(t.id)"
    >
      <ToastTitle as="span">{{ t.text }}</ToastTitle>
    </ToastRoot>
    <ToastViewport id="toast-root" />
  </ToastProvider>

  <!-- Reka 2.11 marks its own announcement `aria-hidden`, so it is never read: this one is. It has
       to be on the page before the text arrives, and `aria-live` keeps it audible over a dialog. -->
  <VisuallyHidden as="div" role="status" aria-live="polite">
    <p v-for="t in toasts" :key="t.id">{{ t.text }}</p>
  </VisuallyHidden>
</template>
