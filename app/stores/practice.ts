import { defineStore } from 'pinia'
import { shuffle } from '~/utils/shuffle'

const STORAGE_KEY = 'qadb:practice'

interface PracticeState {
  mode: 'curated' | 'random'
  queue: string[]
  index: number
}

export const usePracticeStore = defineStore('practice', () => {
  const mode = ref<'curated' | 'random'>('curated')
  const queue = ref<string[]>([])
  const index = ref(0)

  function hydrate() {
    if (!import.meta.client) return
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as PracticeState
      if (
        parsed &&
        Array.isArray(parsed.queue) &&
        (parsed.mode === 'curated' || parsed.mode === 'random') &&
        typeof parsed.index === 'number'
      ) {
        mode.value = parsed.mode
        queue.value = parsed.queue
        index.value = parsed.index
      }
    } catch {
      /* discard malformed state */
    }
  }

  function persist() {
    if (!import.meta.client) return
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: mode.value, queue: queue.value, index: index.value }))
  }

  function start(m: 'curated' | 'random', ids: string[]) {
    mode.value = m
    queue.value = [...ids]
    index.value = 0
    persist()
  }

  function next() {
    index.value += 1
    persist()
  }

  function reset() {
    queue.value = shuffle(queue.value)
    index.value = 0
    persist()
  }

  function clear() {
    mode.value = 'curated'
    queue.value = []
    index.value = 0
    persist()
  }

  hydrate()

  watch([mode, queue, index], persist, { deep: true })

  return { mode, queue, index, start, next, reset, clear }
})
