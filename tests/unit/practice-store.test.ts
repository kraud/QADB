import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { usePracticeStore } from '../../app/stores/practice'

const KEY = 'qadb:practice'
let stored: Map<string, string>

/** A new app instance, as after a page load: same sessionStorage, new Pinia. */
function load(serverState?: Record<string, unknown>) {
  const pinia = createPinia()
  createApp({}).use(pinia)
  // What Nuxt does with the state the server rendered, before any store is created.
  if (serverState) pinia.state.value.practice = serverState
  setActivePinia(pinia)
  return usePracticeStore()
}

const saved = () => JSON.parse(stored.get(KEY)!)

beforeEach(() => {
  stored = new Map()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('practice store', () => {
  it('start records the scenario', () => {
    const store = load()

    store.start('curated', ['a', 'b'], 's1')

    expect(store.scenarioId).toBe('s1')
    expect(saved()).toEqual({ mode: 'curated', queue: ['a', 'b'], index: 0, scenarioId: 's1' })
  })

  it('resumes the persisted state', async () => {
    const before = load()
    before.start('random', ['a', 'b', 'c'], 's1')
    before.next()
    await nextTick()

    const after = load()

    expect(after.mode).toBe('random')
    expect(after.queue).toEqual(['a', 'b', 'c'])
    expect(after.index).toBe(1)
    expect(after.scenarioId).toBe('s1')
  })

  it('keeps the persisted state over the state rendered by the server', async () => {
    load().start('curated', ['a', 'b'], 's1')

    const store = load({ mode: 'curated', queue: [], index: 0, scenarioId: '' })
    await nextTick()

    expect(store.queue).toEqual(['a', 'b'])
    expect(store.scenarioId).toBe('s1')
    expect(saved().queue).toEqual(['a', 'b'])
  })

  it.each([
    ['without a scenario', { mode: 'curated', queue: ['a'], index: 0 }],
    ['with an empty scenario', { mode: 'curated', queue: ['a'], index: 0, scenarioId: '' }],
    ['with a queue of other things', { mode: 'curated', queue: [1], index: 0, scenarioId: 's1' }],
    ['with a negative index', { mode: 'curated', queue: ['a'], index: -1, scenarioId: 's1' }],
  ])('ignores stored state %s', (_, state) => {
    stored.set(KEY, JSON.stringify(state))

    const store = load()

    expect(store.queue).toEqual([])
    expect(store.index).toBe(0)
    expect(store.scenarioId).toBe('')
  })

  it('ignores stored text that is not JSON', () => {
    stored.set(KEY, 'not json')

    expect(load().queue).toEqual([])
  })

  it('reset reshuffles the queue and starts over in the same scenario', () => {
    const store = load()
    store.start('curated', ['a', 'b', 'c'], 's1')
    store.next()
    store.next()
    vi.spyOn(Math, 'random').mockReturnValue(0)

    store.reset()

    expect(store.queue).toEqual(['b', 'c', 'a'])
    expect(store.index).toBe(0)
    expect(store.scenarioId).toBe('s1')
  })

  it('drop removes the current question, so the next one takes its place', async () => {
    const store = load()
    store.start('curated', ['a', 'b', 'c'], 's1')
    store.next()

    store.drop()
    await nextTick()

    expect(store.queue).toEqual(['a', 'c'])
    expect(store.index).toBe(1)
    expect(saved().queue).toEqual(['a', 'c'])
  })

  it('clear forgets the session', () => {
    const store = load()
    store.start('random', ['a'], 's1')

    store.clear()

    expect(saved()).toEqual({ mode: 'curated', queue: [], index: 0, scenarioId: '' })
  })
})
