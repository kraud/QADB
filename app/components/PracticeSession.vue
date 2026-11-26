<script setup lang="ts">
import type { AttemptRow, QuestionWithStats, ScenarioDetail } from '#shared/types/qadb'
import { contentPath } from '~/utils/scenario-route'
import { shuffle } from '~/utils/shuffle'

type Q = QuestionWithStats & { attempts: AttemptRow[] }

const props = defineProps<{ mode: 'curated' | 'random'; sid: string }>()

const store = usePracticeStore()
const api = useApi()
const { toast } = useToast()

const scenario = ref<ScenarioDetail | null>(null)
const question = ref<Q | null>(null)
const revealed = ref(false)
const grading = ref(false)
const loading = ref(true)
const loadError = ref(false)

const total = computed(() => store.queue.length)
const atEnd = computed(() => store.index >= store.queue.length)
const modeLabel = computed(() =>
  props.mode === 'random' ? 'Random practice' : `Practice — ${total.value} questions selected`,
)
const nextLabel = computed(() => (props.mode === 'random' ? 'Next random question' : 'Next question'))

/** Once left, late answers must not touch the session: another one may have started. */
let left = false
onBeforeUnmount(() => (left = true))

/** Whether a newer load, or leaving, has made this one's answers worthless. */
type Superseded = () => boolean
/** Counts the loads; only the newest one may change what is shown or queued. */
let latestLoad = 0

/** The stored session is this screen's: same mode, same scenario, something queued. */
const hasSession = () => store.mode === props.mode && store.scenarioId === props.sid && store.queue.length > 0

const statusOf = (err: unknown) => (err as { statusCode?: number }).statusCode

/** Reads the scenario. A deleted one ends its session and leads to the scenario list. */
async function loadScenario(): Promise<boolean> {
  try {
    scenario.value = await api<ScenarioDetail>(`/api/scenarios/${encodeURIComponent(props.sid)}`)
    return !left
  } catch (err) {
    if (statusOf(err) !== 404) throw err
    if (left) return false
    if (store.scenarioId === props.sid) store.clear()
    toast('That scenario no longer exists')
    await navigateTo('/scenarios', { replace: true })
    return false
  }
}

/** Starts a random session over all of the scenario's questions. */
async function startRandom(superseded: Superseded) {
  const ids = await api<{ id: string }[]>(`/api/scenarios/${encodeURIComponent(props.sid)}/questions/ids`)
  if (superseded()) return false
  if (ids.length) store.start('random', shuffle(ids.map((x) => x.id)), props.sid)
  return ids.length > 0
}

/** Nothing left to practice: back to the content page. */
async function leave(message?: string) {
  if (message) toast(message)
  await navigateTo(contentPath(props.sid), { replace: true })
}

/** Shows the current question, passing over the ones deleted since the session started. */
async function showCurrent(superseded: Superseded) {
  while (!superseded() && !atEnd.value) {
    const id = store.queue[store.index]!
    let found: Q | null = null
    try {
      found = await api<Q>(`/api/questions/${encodeURIComponent(id)}`)
    } catch (err) {
      if (statusOf(err) !== 404) throw err
      // The whole scenario may be gone.
      if (superseded() || !(await loadScenario())) return
    }
    if (superseded()) return
    if (found?.scenarioId === props.sid) {
      question.value = found
      return
    }
    // `drop` removes whatever is current, so make sure that still is the one that failed.
    if (store.queue[store.index] === id) store.drop()
    if (!store.queue.length) {
      if (props.mode === 'random' && (await startRandom(superseded))) continue
      if (!superseded()) await leave('No questions to practice')
      return
    }
  }
  if (!superseded()) question.value = null
}

/** Runs one loading step, showing the skeleton meanwhile and the retry panel if it fails. */
async function load(step: (superseded: Superseded) => Promise<void>) {
  const request = ++latestLoad
  const superseded = () => left || request !== latestLoad
  loading.value = true
  loadError.value = false
  try {
    await step(superseded)
  } catch {
    if (superseded()) return
    question.value = null
    loadError.value = true
  }
  if (!superseded()) loading.value = false
}

async function setup(superseded: Superseded) {
  if (!(await loadScenario())) return
  if (!hasSession()) {
    // A curated queue only comes from a selection; a session of another scenario stays untouched.
    if (props.mode === 'curated') return leave()
    if (!(await startRandom(superseded))) {
      if (!superseded()) await leave('No questions to practice')
      return
    }
  }
  await showCurrent(superseded)
}

const loadQuestion = () => load(showCurrent)
const retry = () => load(scenario.value && hasSession() ? showCurrent : setup)

/** The card still shows this question: an answer about it may change what is shown. */
const isCurrent = (id: string) => !left && question.value?.id === id && store.queue[store.index] === id

async function grade(correct: boolean) {
  if (!question.value || grading.value) return
  const { id } = question.value
  grading.value = true
  try {
    await api('/api/attempts', {
      method: 'POST',
      body: { questionId: id, correct: correct ? 1 : 0 },
    })
    toast(correct ? 'Correct — recorded' : 'Incorrect — recorded')
    if (isCurrent(id)) await loadQuestion()
  } catch (err) {
    toast('Could not record your answer')
    // Deleted meanwhile: move on to the next one.
    if (statusOf(err) === 404 && isCurrent(id)) {
      revealed.value = false
      await loadQuestion()
    }
  } finally {
    grading.value = false
  }
}

async function toggleMastered(v: boolean) {
  if (!question.value) return
  const { id } = question.value
  try {
    const updated = await api<QuestionWithStats>(`/api/questions/${id}`, {
      method: 'PATCH',
      body: { mastered: v ? 1 : 0 },
    })
    if (isCurrent(id)) question.value = { ...question.value!, mastered: updated.mastered }
    toast(v ? 'Marked as mastered' : 'Mastered flag removed')
  } catch (err) {
    toast('Could not update this question')
    if (statusOf(err) === 404 && isCurrent(id)) {
      revealed.value = false
      await loadQuestion()
    }
  }
}

function next() {
  revealed.value = false
  store.next()
  loadQuestion()
}

function practiceAgain() {
  revealed.value = false
  store.reset()
  loadQuestion()
}

onMounted(() => load(setup))
</script>

<template>
  <p class="practice-mode"><b>{{ modeLabel }}</b></p>

  <template v-if="loading">
    <div class="practice-card">
      <Skeleton height="24px" width="40%" />
      <Skeleton height="40px" style="margin-top: 14px" />
      <Skeleton height="16px" width="60%" style="margin-top: 18px" />
    </div>
  </template>

  <Empty v-else-if="loadError" title="Couldn't load this question" text="Something went wrong fetching it. Check your connection and try again.">
    <Btn variant="secondary" size="sm" @click="retry">Try again</Btn>
  </Empty>

  <template v-else-if="question && scenario">
    <div class="practice-progress">
      <span class="count">Question {{ store.index + 1 }} of {{ total }}</span>
      <Progress :value="store.index" :max="total" aria-label="Practice progress" />
    </div>

    <PracticeCard
      :key="question.id"
      :question="question"
      :scenario="scenario"
      :index="store.index"
      :total="total"
      :mode-label="modeLabel"
      :next-label="nextLabel"
      :revealed="revealed"
      :grading="grading"
      @reveal="revealed = true"
      @grade="grade"
      @mastered="toggleMastered"
      @next="next"
    />

    <TrackRecord :question="question" />
  </template>

  <div v-else-if="scenario && atEnd" class="practice-card">
    <div class="end-panel">
      <div class="end-ic">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12l6 6L20 6" /></svg>
      </div>
      <h2>No more questions</h2>
      <p>You've reached the end of the queue. Great session.</p>
      <div class="row">
        <Btn @click="practiceAgain">Practice again</Btn>
        <Btn variant="secondary" @click="navigateTo(contentPath(sid))">Return to content</Btn>
      </div>
    </div>
  </div>
</template>
