<script setup lang="ts">
import type { QuestionWithStats } from '#shared/types/qadb'
import { CATEGORY, CATEGORY_COLOR, DIFFICULTY, DIFFICULTY_LABEL, IMPORTANCE, IMPORTANCE_LABEL, type Category } from '#shared/enums'
import { renderMarkdown } from '~/utils/markdown'

const props = defineProps<{ open: boolean; questionId: string | null }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
  (e: 'requestDelete', id: string): void
}>()

const api = useApi()
const { toast } = useToast()

const question = ref('')
const answer = ref('')
const answerMode = ref<'markdown' | 'display'>('markdown')
const difficulty = ref('medium')
const importance = ref('mid')
const categories = ref<string[]>(['JS'])
const link = ref('')
const mastered = ref(false)
const saving = ref(false)
const formatting = ref(false)
const loading = ref(false)
const serverError = ref('')
const fieldErrors = reactive({ question: '', answer_summary: '', link: '' })
const initial = reactive({ question: '', answer: '', link: '' })

const isEdit = computed(() => !!props.questionId)
const title = computed(() => (isEdit.value ? 'Edit question' : 'Add question'))
const hasUnsavedChanges = computed(
  () =>
    question.value.trim() !== initial.question ||
    answer.value.trim() !== initial.answer ||
    link.value.trim() !== initial.link,
)

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
  categories.value = ['JS']
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
    initial.question = ''
    initial.answer = ''
    initial.link = ''
    if (props.questionId) {
      loading.value = true
      try {
        const q = await api<QuestionWithStats>(`/api/questions/${props.questionId}`)
        question.value = q.question
        answer.value = q.answer_summary
        difficulty.value = q.difficulty
        importance.value = q.importance
        categories.value = q.category.length ? q.category : ['JS']
        link.value = q.link ?? ''
        mastered.value = q.mastered === 1
        initial.question = question.value.trim()
        initial.answer = answer.value.trim()
        initial.link = link.value.trim()
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
    category: categories.value,
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

const confirmDiscardOpen = ref(false)

function attemptClose() {
  if (hasUnsavedChanges.value) confirmDiscardOpen.value = true
  else emit('close')
}

function discard() {
  confirmDiscardOpen.value = false
  emit('close')
}

watch(confirmDiscardOpen, (open) => {
  if (open) return
  nextTick(() => {
    document.querySelector<HTMLElement>('.overlay')?.querySelector<HTMLElement>('input, textarea, select, button')?.focus()
  })
})

async function formatWithAi() {
  if (!answer.value.trim() || formatting.value) return
  formatting.value = true
  try {
    const { content } = await api<{ content: string }>('/api/format-answer', {
      method: 'POST',
      body: { content: answer.value },
    })
    answer.value = content
    toast('Formatted with AI')
  } catch {
    toast('Could not format. Try again.')
  } finally {
    formatting.value = false
  }
}

function toggleCategory(c: Category) {
  if (categories.value.includes(c)) {
    if (categories.value.length > 1) categories.value = categories.value.filter((v) => v !== c)
  } else {
    categories.value = [...categories.value, c]
  }
}

function requestDelete() {
  if (props.questionId) emit('requestDelete', props.questionId)
}
</script>

<template>
  <Modal :open="open" :aria-label="title" @close="attemptClose">
    <div class="modal-head">
      <h2>{{ title }}</h2>
      <button class="icon-btn" aria-label="Close" @click="attemptClose">
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
              <div class="answer-actions">
                <Btn
                  v-if="answerMode === 'markdown'"
                  variant="ghost"
                  size="sm"
                  type="button"
                  :loading="formatting"
                  :disabled="!answer.trim()"
                  @click="formatWithAi"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                    style="width: 14px; height: 14px"
                  >
                      <path d="M19 9l-1.25-2.75L15 5l2.75-1.25L19 1l1.25 2.75L23 5l-2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z"/>
                  </svg>
                  Format
                </Btn>
                <Seg v-model="answerMode" :options="answerModeOptions" />
              </div>
            </div>
            <Input
              v-show="answerMode === 'markdown'"
              v-model="answer"
              type="textarea"
              placeholder="What you'd say out loud in the interview — short and spoken-style. **Markdown** supported."
              :error="fieldErrors.answer_summary"
            />
            <div v-if="answerMode === 'display'" class="answer-preview md" :class="{ invalid: !!fieldErrors.answer_summary }" v-html="renderMarkdown(answer)" />
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
                :active="categories.includes(c)"
                :color="CATEGORY_COLOR[c]"
                :disabled="categories.length === 1 && categories.includes(c)"
                @click="toggleCategory(c)"
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
        <Btn variant="secondary" @click="attemptClose">Cancel</Btn>
        <Btn type="submit" :loading="saving">Save</Btn>
      </div>
    </form>
  </Modal>

  <Modal :open="confirmDiscardOpen" role="alertdialog" aria-label="Discard changes?" max-width="440px" @close="confirmDiscardOpen = false">
    <div class="modal-head"><h2>Discard changes?</h2></div>
    <div class="confirm-body">
      <p>Your edits to this question will be lost.</p>
    </div>
    <div class="modal-foot" style="padding-top: 8px">
      <Btn variant="secondary" @click="confirmDiscardOpen = false">Keep editing</Btn>
      <Btn variant="error" @click="discard">Discard</Btn>
    </div>
  </Modal>
</template>
