<script setup lang="ts">
import type { AttemptRow, QuestionWithStats } from '#shared/types/qadb'
import { shuffle } from '~/utils/shuffle'

type Q = QuestionWithStats & { attempts: AttemptRow[] }

const props = defineProps<{ mode: 'curated' | 'random' }>()

const store = usePracticeStore()
const api = useApi()
const { toast } = useToast()

const question = ref<Q | null>(null)
const revealed = ref(false)
const grading = ref(false)
const loading = ref(false)

const total = computed(() => store.queue.length)
const atEnd = computed(() => store.index >= store.queue.length)
const modeLabel = computed(() =>
  props.mode === 'random' ? 'Random practice' : `Practice — ${total.value} questions selected`,
)
const nextLabel = computed(() => (props.mode === 'random' ? 'Next random question' : 'Next question'))

async function loadQuestion() {
  if (store.index >= store.queue.length) {
    question.value = null
    return
  }
  loading.value = true
  try {
    question.value = await api<Q>(`/api/questions/${store.queue[store.index]}`)
  } catch {
    question.value = null
  } finally {
    loading.value = false
  }
}

async function setup() {
  if (props.mode === 'curated') {
    if (store.mode !== 'curated' || store.queue.length === 0) {
      await navigateTo('/content')
      return
    }
  } else {
    if (!(store.mode === 'random' && store.queue.length > 0)) {
      const ids = await api<{ id: string }[]>('/api/questions/ids')
      if (ids.length === 0) {
        toast('No questions to practice')
        await navigateTo('/content')
        return
      }
      store.start('random', shuffle(ids.map((x) => x.id)))
    }
  }
  await loadQuestion()
}

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
  } catch {
    toast('Could not record your answer')
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
  } catch {
    toast('Could not update this question')
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

onMounted(setup)
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

  <template v-else-if="question">
    <div class="practice-progress">
      <span class="count">Question {{ store.index + 1 }} of {{ total }}</span>
      <div class="progress-bar"><div class="fill" :style="{ width: Math.round((store.index / total) * 100) + '%' }" /></div>
    </div>

    <PracticeCard
      :key="question.id"
      :question="question"
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

  <div v-else-if="atEnd" class="practice-card">
    <div class="end-panel">
      <div class="end-ic">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12l6 6L20 6" /></svg>
      </div>
      <h2>No more questions</h2>
      <p>You've reached the end of the queue. Great session.</p>
      <div class="row">
        <Btn @click="practiceAgain">Practice again</Btn>
        <Btn variant="secondary" @click="navigateTo('/content')">Return to content</Btn>
      </div>
    </div>
  </div>
</template>
