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
async function startRandom() {
  const ids = await api<{ id: string }[]>(`/api/scenarios/${encodeURIComponent(props.sid)}/questions/ids`)
  if (left) return false
  if (ids.length) store.start('random', shuffle(ids.map((x) => x.id)), props.sid)
  return ids.length > 0
}

/** Nothing left to practice: back to the content page. */
async function leave(message?: string) {
  if (message) toast(message)
  await navigateTo(contentPath(props.sid), { replace: true })
}

/** Shows the current question, passing over the ones deleted since the session started. */
async function showCurrent() {
  while (!atEnd.value) {
    const id = store.queue[store.index]!
    let found: Q | null = null
    try {
      found = await api<Q>(`/api/questions/${encodeURIComponent(id)}`)
    } catch (err) {
      if (statusOf(err) !== 404) throw err
      // The whole scenario may be gone.
      if (left || !(await loadScenario())) return
    }
    if (left) return
    if (found?.scenarioId === props.sid) {
      question.value = found
      return
    }
    store.drop()
    if (!store.queue.length) {
      if (props.mode === 'random' && (await startRandom())) continue
      if (!left) await leave('No questions to practice')
      return
    }
  }
  question.value = null
}

/** Runs one loading step, showing the skeleton meanwhile and the retry panel if it fails. */
async function load(step: () => Promise<void>) {
  loading.value = true
  loadError.value = false
  try {
    await step()
  } catch {
    question.value = null
    loadError.value = true
  } finally {
    loading.value = false
  }
}

async function setup() {
  if (!(await loadScenario())) return
  if (!hasSession()) {
    // A curated queue only comes from a selection; a session of another scenario stays untouched.
    if (props.mode === 'curated') return leave()
    if (!(await startRandom())) {
      if (!left) await leave('No questions to practice')
      return
    }
  }
  await showCurrent()
}

const loadQuestion = () => load(showCurrent)
const retry = () => load(scenario.value && hasSession() ? showCurrent : setup)

async function grade(correct: boolean) {
  if (!question.value || grading.value) return
  grading.value = true
  try {
    await api('/api/attempts', {
      method: 'POST',
      body: { questionId: question.value.id, correct: correct ? 1 : 0 },
    })
    toast(correct ? 'Correct — recorded' : 'Incorrect — recorded')
    await loadQuestion()
  } catch (err) {
    toast('Could not record your answer')
    // Deleted meanwhile: move on to the next one.
    if (statusOf(err) === 404) {
      revealed.value = false
      await loadQuestion()
    }
  } finally {
    grading.value = false
  }
}

async function toggleMastered(v: boolean) {
  if (!question.value) return
  try {
    const updated = await api<QuestionWithStats>(`/api/questions/${question.value.id}`, {
      method: 'PATCH',
      body: { mastered: v ? 1 : 0 },
    })
    question.value = { ...question.value, mastered: updated.mastered }
    toast(v ? 'Marked as mastered' : 'Mastered flag removed')
  } catch (err) {
    toast('Could not update this question')
    if (statusOf(err) === 404) {
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
      <div class="progress-bar"><div class="fill" :style="{ width: Math.round((store.index / total) * 100) + '%' }" /></div>
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
