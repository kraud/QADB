<script setup lang="ts">
import type { AttemptRow, QuestionWithStats } from '#shared/types/qadb'
import { fmtDT } from '~/utils/format'
import { renderMarkdown } from '~/utils/markdown'
import { contentPath, practicePath } from '~/utils/scenario-route'

const route = useRoute()
const api = useApi()
const { toast } = useToast()
const practice = usePracticeStore()

type QuestionDetail = QuestionWithStats & { attempts: AttemptRow[] }

const sid = computed(() => String(route.params.sid))
const id = computed(() => String(route.params.id))

const { scenario, error: scenarioError, refresh: refreshScenario } = useScenario(sid)
const { data: question, error, refresh } = await useAsyncData(
  () => `question-${id.value}`,
  () => api<QuestionDetail>(`/api/questions/${encodeURIComponent(id.value)}`),
)

const editorOpen = ref(false)
const confirmOpen = ref(false)
const togglingMastered = ref(false)

/** Missing or someone else's, or a question that belongs to another scenario than the URL says. */
const notFound = computed(
  () =>
    scenarioError.value?.statusCode === 404 ||
    error.value?.statusCode === 404 ||
    (!!question.value && question.value.scenarioId !== sid.value),
)

async function retry() {
  await Promise.all([refreshScenario(), refresh()])
}

async function toggleMastered(v: boolean) {
  togglingMastered.value = true
  try {
    await api(`/api/questions/${id.value}`, { method: 'PATCH', body: { mastered: v ? 1 : 0 } })
    await refresh()
  } catch {
    /* ignored */
  } finally {
    togglingMastered.value = false
  }
}

async function confirmDelete() {
  await api(`/api/questions/${id.value}`, { method: 'DELETE' })
  toast('Question deleted')
  await navigateTo(contentPath(sid.value))
}

function practiceOne() {
  practice.start('curated', [id.value], sid.value)
  navigateTo(practicePath(sid.value))
}
</script>

<template>
  <div class="detail-wrap">
    <div v-if="notFound" class="notfound">
      <p class="code">404 · PAGE NOT FOUND</p>
      <h1>This page doesn't exist.</h1>
      <p>The link may be broken, or the page moved.</p>
      <Btn :to="scenario && !scenarioError ? contentPath(sid) : '/'">Back to content</Btn>
    </div>

    <template v-else-if="question && scenario">
      <NuxtLink class="back-link" :to="contentPath(sid)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6" /></svg>
        Back to content
      </NuxtLink>

      <div class="detail-head">
        <h1>{{ question.question }}</h1>
        <div class="badge-row">
          <AttributeBadges v-if="scenario.attributes.length" :scenario="scenario" :values="question.values" />
          <span class="mastered-ctl" :class="{ on: question.mastered === 1 }">
            <Switch
              :model-value="question.mastered === 1"
              size="sm"
              color="teal"
              aria-label="Mark as mastered"
              @update:model-value="toggleMastered($event)"
            />
            <span class="label">{{ question.mastered === 1 ? 'Mastered ✓' : 'Mastered' }}</span>
          </span>
        </div>
        <div class="detail-actions">
          <Btn variant="secondary" size="sm" @click="editorOpen = true">Edit</Btn>
          <Btn variant="danger" size="sm" @click="confirmOpen = true">Delete</Btn>
          <Btn v-if="question.link" variant="secondary" size="sm" :href="question.link">Open link →</Btn>
        </div>
      </div>

      <div class="callout">
        <div class="callout-label">Answer</div>
        <div class="md" v-html="renderMarkdown(question.answer)"></div>
      </div>

      <div class="detail-meta"><h2>Track record</h2></div>

      <div class="track-summary">
        <span class="ts">Times practiced <b>{{ question.stats.attemptCount }}</b></span>
        <span class="ts">Correct <b>{{ question.stats.correctCount }}</b></span>
        <span class="ts">
          <span v-if="question.stats.trackRecordPct == null" class="blank">—%</span>
          <span v-else class="pct" :class="question.stats.trackRecordPct >= 50 ? 'ok' : 'no'">{{ question.stats.trackRecordPct.toFixed(1) }}%</span>
        </span>
      </div>

      <Empty v-if="question.stats.attemptCount === 0" title="Not practiced yet" text="Practice this question to start a track record.">
        <Btn size="sm" @click="practiceOne">Practice this question</Btn>
      </Empty>
      <table v-else class="tr-table">
        <thead>
          <tr><th>Date · time</th><th class="res">Result</th></tr>
        </thead>
        <tbody>
          <tr v-for="a in question.attempts" :key="a.id">
            <td>{{ fmtDT(a.answered_at) }}</td>
            <td class="res"><span :class="a.correct ? 'ok' : 'no'">{{ a.correct ? '✔' : '✘' }}</span></td>
          </tr>
        </tbody>
      </table>

      <QuestionEditorModal
        :open="editorOpen"
        :question-id="id"
        :scenario="scenario"
        @close="editorOpen = false"
        @saved="refresh"
        @request-delete="editorOpen = false; confirmOpen = true"
      />
      <ConfirmDialog
        :open="confirmOpen"
        :attempt-count="question.stats.attemptCount"
        :question-id="id"
        @close="confirmOpen = false"
        @confirmed="confirmDelete"
      />
    </template>

    <Empty v-else-if="error || scenarioError" title="Couldn't load this question" text="Something went wrong fetching it. Check your connection and try again.">
      <Btn variant="secondary" size="sm" @click="retry">Try again</Btn>
    </Empty>

    <div v-else>
      <Skeleton height="32px" width="60%" />
      <Skeleton height="88px" style="margin-top: 18px" />
    </div>
  </div>
</template>
