import { ref } from 'vue'

export interface ToastItem {
  id: number
  text: string
}

const toasts = ref<ToastItem[]>([])
let nextId = 1

export function useToast() {
  function toast(text: string) {
    toasts.value.push({ id: nextId++, text })
  }

  /** Called when a toast's time is up, or it is swiped away. */
  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return { toasts, toast, dismiss }
}
