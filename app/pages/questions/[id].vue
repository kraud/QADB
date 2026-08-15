<script setup lang="ts">
import type { AttemptRow, QuestionWithStats } from '#shared/types/qadb'
import { CATEGORY_COLOR, DIFFICULTY_COLOR, DIFFICULTY_LABEL, IMPORTANCE_COLOR, IMPORTANCE_LABEL, type Category } from '#shared/enums'
import { fmtDT } from '~/utils/format'
import { renderMarkdown } from '~/utils/markdown'

const route = useRoute()
const api = useApi()
const { toast } = useToast()
const practice = usePracticeStore()

type QuestionDetail = QuestionWithStats & { attempts: AttemptRow[] }

const id = computed(() => String(route.params.id))

const { data: question, pending, error, refresh } = await useAsyncData(
  () => `question-${id.value}`,
  () => api<QuestionDetail>(`/api/questions/${id.value}`),
)

const editorOpen = ref(false)
const confirmOpen = ref(false)
const togglingMastered = ref(false)

const notFound = computed(() => error.value?.statusCode === 404)

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
  await navigateTo('/content')
}

function practiceOne() {
  practice.start('curated', [id.value])
  navigateTo('/practice')
}
</script>

<template>
  <div class="detail-wrap">
    <div v-if="notFound" class="notfound">
      <p class="code">404 · PAGE NOT FOUND</p>
      <h1>This page doesn't exist.</h1>
      <p>The link may be broken, or the page moved.</p>
      <Btn to="/content">Back to content</Btn>
    </div>

    <template v-else-if="question">
      <NuxtLink class="back-link" to="/content">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6" /></svg>
        Back to content
      </NuxtLink>

      <div class="detail-head">
        <h1>{{ question.question }}</h1>
        <div class="badge-row">
          <Badge tone="diff" :color="DIFFICULTY_COLOR[question.difficulty as keyof typeof DIFFICULTY_COLOR]">{{ DIFFICULTY_LABEL[question.difficulty as keyof typeof DIFFICULTY_LABEL] }}</Badge>
          <Badge tone="imp" :color="IMPORTANCE_COLOR[question.importance as keyof typeof IMPORTANCE_COLOR]">{{ IMPORTANCE_LABEL[question.importance as keyof typeof IMPORTANCE_LABEL] }}</Badge>
          <span style="display:flex; gap:4px; flex-wrap:wrap"><Badge v-for="c in question.category" :key="c" tone="cat" :color="CATEGORY_COLOR[c as Category]">{{ c }}</Badge></span>
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
          <Btn v-if="question.link" variant="secondary" size="sm" :href="question.link">Open original question →</Btn>
        </div>
      </div>

      <div class="callout">
        <div class="callout-label">Answer summary</div>
        <div class="md" v-html="renderMarkdown(question.answer_summary)"></div>
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

    <div v-else-if="pending" class="detail-wrap">
      <Skeleton height="32px" width="60%" />
      <Skeleton height="88px" style="margin-top: 18px" />
    </div>
  </div>
</template>
