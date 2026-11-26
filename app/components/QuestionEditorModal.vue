<script setup lang="ts">
import type { AttributeValues, Scenario } from '#shared/scenario/types'
import { defaultValues, missingAttributeIds } from '#shared/scenario/values'
import type { QuestionWithStats } from '#shared/types/qadb'
import { renderMarkdown } from '~/utils/markdown'

const props = defineProps<{
  open: boolean
  questionId: string | null
  /** Where the question belongs; its attributes are the editor's fields. */
  scenario: Scenario | null | undefined
}>()
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
const values = ref<AttributeValues>({})
const link = ref('')
const mastered = ref(false)
const saving = ref(false)
const formatting = ref(false)
const loading = ref(false)
const serverError = ref('')
const fieldErrors = reactive({ question: '', answer: '', link: '' })
/** Error messages by attribute id. */
const valueErrors = ref<Record<string, string>>({})
const initial = reactive({ question: '', answer: '', link: '', values: '' })

const isEdit = computed(() => !!props.questionId)
const title = computed(() => (isEdit.value ? 'Edit question' : 'Add question'))
const attributes = computed(() => props.scenario?.attributes ?? [])

/**
 * An entry for every attribute of the scenario: its known options, in option order, and never two
 * for single selection.
 */
function normalized(from: AttributeValues): AttributeValues {
  return Object.fromEntries(
    attributes.value.map((attribute) => {
      const chosen = attribute.options.map((o) => o.id).filter((id) => from[attribute.id]?.includes(id))
      return [attribute.id, attribute.selectionMode === 'single' ? chosen.slice(0, 1) : chosen]
    }),
  )
}

const hasUnsavedChanges = computed(
  () =>
    question.value.trim() !== initial.question ||
    answer.value.trim() !== initial.answer ||
    link.value.trim() !== initial.link ||
    JSON.stringify(normalized(values.value)) !== initial.values,
)

const answerModeOptions = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'display', label: 'Display' },
]

/** What is in the form now counts as unchanged. */
function markUnchanged() {
  initial.question = question.value.trim()
  initial.answer = answer.value.trim()
  initial.link = link.value.trim()
  initial.values = JSON.stringify(normalized(values.value))
}

function requiredMessages(scenario: Scenario, chosen: AttributeValues) {
  const missing = missingAttributeIds(scenario, chosen)
  return Object.fromEntries(
    scenario.attributes.filter((a) => missing.includes(a.id)).map((a) => [a.id, `${a.name} is required`]),
  )
}

function setValue(attributeId: string, optionIds: string[]) {
  values.value = { ...values.value, [attributeId]: optionIds }
  const { [attributeId]: _, ...others } = valueErrors.value
  valueErrors.value = others
}

function reset() {
  question.value = ''
  answer.value = ''
  answerMode.value = 'markdown'
  values.value = {}
  link.value = ''
  mastered.value = false
  saving.value = false
  loading.value = false
  serverError.value = ''
  fieldErrors.question = ''
  fieldErrors.answer = ''
  fieldErrors.link = ''
  valueErrors.value = {}
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    reset()
    // Only a new question starts with the defaults: a stored one shows what it has.
    if (!props.questionId && props.scenario) values.value = normalized(defaultValues(props.scenario))
    markUnchanged()
    if (props.questionId) {
      loading.value = true
      try {
        const q = await api<QuestionWithStats>(`/api/questions/${props.questionId}`)
        question.value = q.question
        answer.value = q.answer
        values.value = normalized(q.values)
        link.value = q.link ?? ''
        mastered.value = q.mastered === 1
        if (props.scenario) valueErrors.value = requiredMessages(props.scenario, values.value)
        markUnchanged()
      } catch {
        serverError.value = 'Could not load this question.'
      } finally {
        loading.value = false
      }
    }
  },
)

function mapServerError(e: { statusCode?: number; data?: unknown }) {
  // The response body wraps the issues in `data`.
  const body = e?.data as { data?: unknown } | undefined
  const issues = Array.isArray(body) ? body : body?.data
  if (e?.statusCode === 422 && Array.isArray(issues)) {
    let shown = false
    for (const issue of issues as { path?: unknown[]; message?: string }[]) {
      const [field, attributeId] = issue.path ?? []
      if (field === 'question') fieldErrors.question = 'The question is required.'
      else if (field === 'answer') fieldErrors.answer = 'An answer is required.'
      else if (field === 'link') fieldErrors.link = 'Enter a valid URL.'
      else if (field === 'values' && attributes.value.some((a) => a.id === attributeId)) {
        valueErrors.value = { ...valueErrors.value, [attributeId as string]: issue.message ?? 'Check this value.' }
      } else continue
      shown = true
    }
    if (!shown) serverError.value = 'Please check your input.'
  } else {
    serverError.value = 'Something went wrong. Please try again.'
  }
}

async function save() {
  if (!props.scenario) return
  fieldErrors.question = question.value.trim() ? '' : 'The question is required.'
  fieldErrors.answer = answer.value.trim() ? '' : 'An answer is required.'
  const chosen = normalized(values.value)
  valueErrors.value = requiredMessages(props.scenario, chosen)
  if (fieldErrors.question || fieldErrors.answer || Object.keys(valueErrors.value).length) return

  const body = {
    question: question.value.trim(),
    answer: answer.value.trim(),
    values: chosen,
  }

  saving.value = true
  serverError.value = ''
  try {
    if (isEdit.value) {
      await api(`/api/questions/${props.questionId}`, {
        method: 'PATCH',
        // An emptied link is sent as such, so that it is removed.
        body: { ...body, link: link.value.trim(), mastered: mastered.value ? 1 : 0 },
      })
    } else {
      await api(`/api/scenarios/${encodeURIComponent(props.scenario.id)}/questions`, {
        method: 'POST',
        body: { ...body, link: link.value.trim() || undefined },
      })
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
          <Input v-model="question" label="Question" type="textarea" placeholder="What do you want to be asked?" :error="fieldErrors.question" />
          <div class="answer-edit">
            <div class="answer-field-head">
              <label>Answer</label>
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
              aria-label="Answer"
              placeholder="Short, as you would say it. **Markdown** supported."
              :error="fieldErrors.answer"
            />
            <div v-if="answerMode === 'display'" class="answer-preview md" :class="{ invalid: !!fieldErrors.answer }" v-html="renderMarkdown(answer)" />
            <div v-if="answerMode === 'display' && fieldErrors.answer" class="field-err">
              {{ fieldErrors.answer }}
            </div>
          </div>

          <AttributeField
            v-for="attribute in attributes"
            :key="attribute.id"
            :attribute="attribute"
            :model-value="values[attribute.id] ?? []"
            :error="valueErrors[attribute.id]"
            @update:model-value="setValue(attribute.id, $event)"
          />

          <Input
            v-model="link"
            label="Link"
            type="url"
            placeholder="https://example.com/…"
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
