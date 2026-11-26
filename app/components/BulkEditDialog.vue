<script setup lang="ts">
import { planBulk, type BulkAction } from '#shared/scenario/bulk'
import { colorVar } from '#shared/scenario/colors'
import type { Attribute, Scenario } from '#shared/scenario/types'
import { missingAttributeIds } from '#shared/scenario/values'
import type { QuestionWithStats } from '#shared/types/qadb'

/** The most questions one request may name. */
const MAX_QUESTIONS = 2000

const props = defineProps<{
  open: boolean
  scenario: Scenario
  /** The selected questions, as listed. */
  questions: QuestionWithStats[]
  /** The list is being read: nothing can be applied until it is. */
  busy?: boolean
}>()
const emit = defineEmits<{
  (e: 'close'): void
  /** Saved; `updated` questions changed. */
  (e: 'applied', updated: number): void
  /** The server refused: what is listed is out of date. */
  (e: 'stale'): void
}>()

const api = useApi()
const uid = useId()

const attributeId = ref('')
const chosenAction = ref<BulkAction | ''>('')
const chosenIds = ref<string[]>([])
const saving = ref(false)
const serverError = ref('')

// Neither stands in for a missing choice: what is applied was always chosen, or shown on opening.
const attribute = computed<Attribute | undefined>(() =>
  props.scenario.attributes.find((a) => a.id === attributeId.value),
)

const LABELS: Record<BulkAction, string> = {
  set: 'Set',
  clear: 'Clear',
  add: 'Add',
  replace: 'Replace',
  remove: 'Remove',
}

function actionsFor(target: Attribute | undefined): BulkAction[] {
  if (!target) return []
  if (target.selectionMode === 'multiple') return ['add', 'replace', 'remove']
  return target.required ? ['set'] : ['set', 'clear']
}

const actions = computed(() => actionsFor(attribute.value))
const action = computed(() => actions.value.find((a) => a === chosenAction.value))

// Only options the attribute still has: the scenario can be read again while the dialog is open.
const optionIds = computed(() =>
  (attribute.value?.options ?? []).map((o) => o.id).filter((id) => chosenIds.value.includes(id)),
)

const plan = computed(() =>
  attribute.value && action.value
    ? planBulk(attribute.value, props.questions, action.value, optionIds.value)
    : null,
)

const tooMany = computed(() => props.questions.length > MAX_QUESTIONS)
const count = (n: number) => `${n} question${n === 1 ? '' : 's'}`

/** What applying would do, or why it cannot be done. */
const outcome = computed(() => {
  if (tooMany.value) return { blocked: true, text: `Select at most ${MAX_QUESTIONS} questions to edit them together.` }
  const result = plan.value
  if (!result) return { blocked: true, text: attribute.value ? 'Choose an action.' : 'Choose an attribute.' }
  if (result.ok) {
    const n = result.changes.length
    return { blocked: !n, text: n ? `${count(n)} will change.` : 'No questions will change.' }
  }
  if (result.reason === 'would-empty') {
    return {
      blocked: true,
      refused: true,
      text: `${attribute.value!.name} is required, and this would leave ${count(result.count)} without an option. Nothing would be changed.`,
    }
  }
  return { blocked: true, text: action.value === 'set' ? 'Choose an option.' : 'Choose at least one option.' }
})

function chooseAttribute(id: string) {
  attributeId.value = id
  chosenAction.value = actionsFor(attribute.value)[0] ?? ''
  chosenIds.value = []
  serverError.value = ''
}

function chooseAction(next: BulkAction) {
  chosenAction.value = next
  chosenIds.value = []
  serverError.value = ''
}

function toggle(id: string) {
  if (action.value === 'set') chosenIds.value = [id]
  else if (chosenIds.value.includes(id)) chosenIds.value = chosenIds.value.filter((x) => x !== id)
  else chosenIds.value = [...chosenIds.value, id]
  serverError.value = ''
}

// Each opening starts afresh, at the first attribute a selected question is missing, if any.
watch(
  () => props.open,
  (open) => {
    if (!open) return
    const missing = new Set(props.questions.flatMap((q) => missingAttributeIds(props.scenario, q.values)))
    const first = props.scenario.attributes.find((a) => missing.has(a.id)) ?? props.scenario.attributes[0]
    chooseAttribute(first?.id ?? '')
  },
)

// The scenario read again may have lost the chosen attribute, or the action may no longer suit it.
// Turning to another one unasked could change what was not meant: it has to be picked again.
watch(
  () => props.scenario,
  () => {
    if (action.value) return
    if (!attribute.value) attributeId.value = ''
    chosenAction.value = ''
    chosenIds.value = []
  },
)

// With nothing selected any more (the list changed underneath) there is nothing to edit.
watch(
  () => props.open && !saving.value && !props.questions.length,
  (empty) => {
    if (empty) emit('close')
  },
)

const body = ref<HTMLElement | null>(null)

async function apply() {
  if (saving.value || props.busy || outcome.value.blocked) return
  saving.value = true
  serverError.value = ''
  try {
    const { updated } = await api<{ updated: number }>(
      `/api/scenarios/${encodeURIComponent(props.scenario.id)}/questions/bulk`,
      {
        method: 'PATCH',
        body: {
          questionIds: props.questions.map((q) => q.id),
          attributeId: attribute.value!.id,
          action: action.value,
          optionIds: action.value === 'clear' ? [] : optionIds.value,
        },
      },
    )
    saving.value = false
    emit('applied', updated)
  } catch (err) {
    const { statusCode, data } = err as { statusCode?: number; data?: { data?: unknown } }
    // The response body wraps the details in `data`: a reason, unless the request was malformed.
    const reason = (data?.data as { reason?: string } | undefined)?.reason
    if (statusCode === 404 || reason) {
      serverError.value = 'The questions changed since the list was read. Nothing was changed.'
      emit('stale')
    } else {
      serverError.value = 'Something went wrong. Please try again.'
    }
    saving.value = false
    // Apply was disabled meanwhile, which dropped the focus: take it back.
    await nextTick()
    body.value?.closest('.modal')?.querySelector<HTMLElement>('[role="combobox"]:enabled')?.focus()
  }
}

function close() {
  if (!saving.value) emit('close')
}
</script>

<template>
  <Modal :open="open" aria-label="Edit attributes" max-width="480px" @close="close">
    <div class="modal-head"><h2>Edit attributes</h2></div>
    <form novalidate @submit.prevent="apply">
      <div ref="body" class="modal-body">
        <p class="bulk-scope">{{ count(questions.length) }} selected</p>

        <div v-if="serverError" class="alert alert-error bulk-error" role="alert">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
          <span>{{ serverError }}</span>
        </div>

        <div class="field">
          <label :for="`${uid}-attribute`">Attribute</label>
          <Select
            :id="`${uid}-attribute`"
            :model-value="attribute?.id"
            :options="scenario.attributes.map((a) => ({ value: a.id, label: a.name }))"
            :disabled="saving"
            @update:model-value="chooseAttribute"
          />
        </div>

        <div class="field">
          <label :for="`${uid}-action`">Action</label>
          <Select
            :id="`${uid}-action`"
            :model-value="action"
            :options="actions.map((a) => ({ value: a, label: LABELS[a] }))"
            :disabled="saving || !attribute"
            @update:model-value="chooseAction($event as BulkAction)"
          />
        </div>

        <div v-if="attribute && action && action !== 'clear'" class="field" role="group" :aria-labelledby="`${uid}-options`">
          <span :id="`${uid}-options`" class="field-label">{{ action === 'set' ? 'Option' : 'Options' }}</span>
          <div class="chip-group">
            <Chip
              v-for="option in attribute.options"
              :key="option.id"
              :active="optionIds.includes(option.id)"
              :color="colorVar(option.color)"
              :disabled="saving"
              @click="toggle(option.id)"
            >
              {{ option.label }}
            </Chip>
          </div>
        </div>

        <p class="bulk-outcome" :class="{ refused: outcome.refused }" role="status">{{ outcome.text }}</p>
      </div>

      <div class="modal-foot">
        <Btn variant="secondary" :disabled="saving" @click="close">Cancel</Btn>
        <Btn type="submit" :disabled="busy || outcome.blocked" :loading="saving">Apply</Btn>
      </div>
    </form>
  </Modal>
</template>
