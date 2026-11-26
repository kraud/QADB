import { defineStore, skipHydrate } from 'pinia'
import { ref, watch } from 'vue'
import { shuffle } from '~/utils/shuffle'

const STORAGE_KEY = 'qadb:practice'

export type PracticeMode = 'curated' | 'random'

interface PracticeState {
  mode: PracticeMode
  queue: string[]
  index: number
  /** The scenario the queued questions belong to; empty without a session. */
  scenarioId: string
}

function isState(value: unknown): value is PracticeState {
  const state = value as Partial<PracticeState> | null
  return (
    !!state &&
    (state.mode === 'curated' || state.mode === 'random') &&
    Array.isArray(state.queue) &&
    state.queue.every((id) => typeof id === 'string') &&
    Number.isInteger(state.index) &&
    state.index! >= 0 &&
    typeof state.scenarioId === 'string' &&
    state.scenarioId !== ''
  )
}

export const usePracticeStore = defineStore('practice', () => {
  const mode = ref<PracticeMode>('curated')
  const queue = ref<string[]>([])
  const index = ref(0)
  const scenarioId = ref('')

  function hydrate() {
    if (import.meta.server) return
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const parsed: unknown = JSON.parse(raw)
      if (isState(parsed)) {
        mode.value = parsed.mode
        queue.value = parsed.queue
        index.value = parsed.index
        scenarioId.value = parsed.scenarioId
      }
    } catch {
      /* discard malformed state */
    }
  }

  function persist() {
    if (import.meta.server) return
    const state: PracticeState = {
      mode: mode.value,
      queue: queue.value,
      index: index.value,
      scenarioId: scenarioId.value,
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }

  function start(m: PracticeMode, ids: string[], sid: string) {
    mode.value = m
    queue.value = [...ids]
    index.value = 0
    scenarioId.value = sid
    persist()
  }

  function next() {
    index.value += 1
    persist()
  }

  /** Removes the current question from the queue; the one after it takes its place. */
  function drop() {
    queue.value = queue.value.filter((_, i) => i !== index.value)
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
    scenarioId.value = ''
    persist()
  }

  hydrate()

  watch([mode, queue, index, scenarioId], persist, { deep: true })

  // The state lives in the browser's sessionStorage. Without `skipHydrate`, Pinia would replace it
  // with the empty state of the store the server rendered the header with.
  return {
    mode: skipHydrate(mode),
    queue: skipHydrate(queue),
    index: skipHydrate(index),
    scenarioId: skipHydrate(scenarioId),
    start,
    next,
    drop,
    reset,
    clear,
  }
})
