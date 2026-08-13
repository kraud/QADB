import { ref } from 'vue'

export interface ToastItem {
  id: number
  text: string
}

const toasts = ref<ToastItem[]>([])
let nextId = 1

export function useToast() {
  function toast(text: string) {
    const id = nextId++
    toasts.value.push({ id, text })
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    }, 2400)
  }

  return { toasts, toast }
}
