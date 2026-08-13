<script setup lang="ts">
import type { QuestionWithStats } from '#shared/types/qadb'
import { CATEGORY, CATEGORY_COLOR, DIFFICULTY, DIFFICULTY_LABEL, IMPORTANCE, IMPORTANCE_LABEL } from '#shared/enums'
import { renderMarkdown } from '~/utils/markdown'

const props = defineProps<{ open: boolean; questionId: string | null }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
  (e: 'requestDelete', id: string): void
}>()

const api = useApi()

const question = ref('')
const answer = ref('')
const answerMode = ref<'markdown' | 'display'>('markdown')
const difficulty = ref('medium')
const importance = ref('mid')
const category = ref('JS')
const link = ref('')
const mastered = ref(false)
const saving = ref(false)
const loading = ref(false)
const serverError = ref('')
const fieldErrors = reactive({ question: '', answer_summary: '', link: '' })

const isEdit = computed(() => !!props.questionId)
const title = computed(() => (isEdit.value ? 'Edit question' : 'Add question'))

const diffOptions = DIFFICULTY.map((v) => ({ value: v, label: DIFFICULTY_LABEL[v] }))
const impOptions = IMPORTANCE.map((v) => ({ value: v, label: IMPORTANCE_LABEL[v] }))
const answerModeOptions = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'display', label: 'Display' },
]

function reset() {
  question.value = ''
  answer.value = ''
  answerMode.value = 'markdown'
  difficulty.value = 'medium'
  importance.value = 'mid'
  category.value = 'JS'
  link.value = ''
  mastered.value = false
  saving.value = false
  loading.value = false
  serverError.value = ''
  fieldErrors.question = ''
  fieldErrors.answer_summary = ''
  fieldErrors.link = ''
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    reset()
    if (props.questionId) {
      loading.value = true
      try {
        const q = await api<QuestionWithStats>(`/api/questions/${props.questionId}`)
        question.value = q.question
        answer.value = q.answer_summary
        difficulty.value = q.difficulty
        importance.value = q.importance
        category.value = q.category
        link.value = q.link ?? ''
        mastered.value = q.mastered === 1
      } catch {
        serverError.value = 'Could not load this question.'
      } finally {
        loading.value = false
      }
    }
  },
)

function mapServerError(e: { statusCode?: number; data?: unknown }) {
  if (e?.statusCode === 422 && Array.isArray(e.data)) {
    for (const issue of e.data as { path?: unknown[]; message?: string }[]) {
      const field = issue.path?.[0]
      if (field === 'question') fieldErrors.question = 'The question is required.'
      else if (field === 'answer_summary') fieldErrors.answer_summary = 'An answer summary is required.'
      else if (field === 'link') fieldErrors.link = 'Enter a valid URL.'
    }
    if (!fieldErrors.question && !fieldErrors.answer_summary && !fieldErrors.link) {
      serverError.value = 'Please check your input.'
    }
  } else {
    serverError.value = 'Something went wrong. Please try again.'
  }
}

async function save() {
  fieldErrors.question = question.value.trim() ? '' : 'The question is required.'
  fieldErrors.answer_summary = answer.value.trim() ? '' : 'An answer summary is required.'
  if (fieldErrors.question || fieldErrors.answer_summary) return

  const body = {
    question: question.value.trim(),
    answer_summary: answer.value.trim(),
    difficulty: difficulty.value,
    importance: importance.value,
    category: category.value,
    link: link.value.trim() || undefined,
  }

  saving.value = true
  serverError.value = ''
  try {
    if (isEdit.value) {
      await api(`/api/questions/${props.questionId}`, {
        method: 'PATCH',
        body: { ...body, mastered: mastered.value ? 1 : 0 },
      })
    } else {
      await api('/api/questions', { method: 'POST', body })
    }
    emit('saved')
    emit('close')
  } catch (err) {
    mapServerError(err as { statusCode?: number; data?: unknown })
  } finally {
    saving.value = false
  }
}

function requestDelete() {
  if (props.questionId) emit('requestDelete', props.questionId)
}
</script>

<template>
  <Modal :open="open" :aria-label="title" @close="emit('close')">
    <div class="modal-head">
      <h2>{{ title }}</h2>
      <button class="icon-btn" aria-label="Close" @click="emit('close')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>

    <form novalidate @submit.prevent="save">
      <div class="modal-body">
        <div v-if="serverError" class="alert alert-error" style="margin-bottom: 14px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
          <span>{{ serverError }}</span>
        </div>

        <div v-if="loading">
          <Skeleton height="88px" />
          <Skeleton height="88px" style="margin-top: 14px" />
        </div>

        <template v-else>
          <Input v-model="question" label="Question" type="textarea" placeholder="The interview prompt" :error="fieldErrors.question" />
          <div class="answer-edit">
            <div class="answer-field-head">
              <label>Answer summary</label>
              <Seg v-model="answerMode" :options="answerModeOptions" />
            </div>
            <Input
              v-if="answerMode === 'markdown'"
              v-model="answer"
              type="textarea"
              placeholder="What you'd say out loud in the interview — short and spoken-style. **Markdown** supported."
              :error="fieldErrors.answer_summary"
            />
            <div v-else class="answer-preview md" :class="{ invalid: !!fieldErrors.answer_summary }" v-html="renderMarkdown(answer)" />
            <div v-if="answerMode === 'display' && fieldErrors.answer_summary" class="field-err">
              {{ fieldErrors.answer_summary }}
            </div>
          </div>

          <div class="field">
            <label>Difficulty</label>
            <Seg v-model="difficulty" :options="diffOptions" />
          </div>

          <div class="field">
            <label>Importance</label>
            <Seg v-model="importance" :options="impOptions" />
          </div>

          <div class="field">
            <label>Category</label>
            <div class="chip-group">
              <Chip
                v-for="c in CATEGORY"
                :key="c"
                :active="category === c"
                :color="CATEGORY_COLOR[c]"
                @click="category = c"
              >
                {{ c }}
              </Chip>
            </div>
          </div>

          <Input
            v-model="link"
            label="Link to original GreatFrontend question"
            type="url"
            placeholder="https://www.greatfrontend.com/questions/…"
            :error="fieldErrors.link"
          />

          <div v-if="isEdit" class="field">
            <Switch v-model="mastered" label="Mark as mastered" aria-label="Mark as mastered" style="margin-top: 4px" />
          </div>

          <div v-if="isEdit" class="danger-zone">
            <h3>Danger zone</h3>
            <p>Deleting also removes this question's practice history.</p>
            <Btn variant="danger" size="sm" @click="requestDelete">Delete question</Btn>
          </div>
        </template>
      </div>

      <div class="modal-foot">
        <Btn variant="secondary" @click="emit('close')">Cancel</Btn>
        <Btn type="submit" :loading="saving">Save</Btn>
      </div>
    </form>
  </Modal>
</template>
