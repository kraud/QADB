<script setup lang="ts">
import type { Conflict } from '#shared/scenario/diff'
import type { ScenarioInput } from '#shared/scenario/schema'
import type { Scenario } from '#shared/scenario/types'
import { moveTargets } from '~/utils/scenario-form'

const props = defineProps<{
  /** Open while there is something to confirm. */
  conflicts: Conflict[]
  /** The stored scenario, which names what is being removed. */
  current: Scenario | null
  /** The scenario about to be saved, which holds the options questions can move to. */
  next: ScenarioInput | null
  /** The server found these: the questions changed since the editor read them. */
  stale?: boolean
  saving?: boolean
}>()
const emit = defineEmits<{
  (e: 'close'): void
  /** By removed option id, where its questions go; null leaves them empty. */
  (e: 'confirm', moveTo: Record<string, string | null>): void
}>()

/** Not an id: option ids and refs have no colon. */
const LEAVE_EMPTY = ':empty'

/** By removed option id; '' while nothing is chosen. */
const choices = ref<Record<string, string>>({})
watch(
  () => props.conflicts,
  () => (choices.value = {}),
)

// The button that sent the save was disabled meanwhile, which dropped the focus: if the dialog is
// still asking afterwards, take it back.
const body = ref<HTMLElement | null>(null)
watch(
  () => props.saving,
  async (saving) => {
    if (saving || !props.conflicts.length) return
    await nextTick()
    body.value?.closest('.modal')?.querySelector<HTMLElement>('button:enabled')?.focus()
  },
)

const questions = (n: number) => `${n} question${n === 1 ? '' : 's'}`

const items = computed(() =>
  props.conflicts.map((conflict) => {
    const stored = props.current?.attributes.find((a) => a.id === conflict.attributeId)
    const kept = props.next?.attributes.find((a) => a.id === conflict.attributeId)
    // Something added elsewhere since the editor was opened has no name here.
    const attribute = kept?.name.trim() || stored?.name || 'an attribute added elsewhere'
    const { count } = conflict

    if (conflict.type === 'attribute-delete') {
      return {
        key: `delete-${conflict.attributeId}`,
        text: `Deleting “${attribute}” removes its values from ${questions(count)}. The questions are kept.`,
      }
    }
    if (conflict.type === 'multiple-to-single') {
      const keeps = count === 1 ? 'It keeps' : 'Each keeps'
      return {
        key: `single-${conflict.attributeId}`,
        text: `${questions(count)} ${count === 1 ? 'has' : 'have'} several ${attribute} options. ${keeps} only the first in option order.`,
      }
    }
    const option = stored?.options.find((o) => o.id === conflict.optionId)?.label ?? 'an option added elsewhere'
    return {
      key: `option-${conflict.optionId}`,
      text: `${questions(count)} ${count === 1 ? 'uses' : 'use'} “${option}” (${attribute}).`,
      choice: {
        optionId: conflict.optionId,
        label: `Questions using ${option}`,
        targets: props.next ? moveTargets(props.next, conflict.attributeId) : [],
        warning: kept?.required
          ? `${attribute} is required: questions left without an option become incomplete.`
          : '',
      },
    }
  }),
)

const complete = computed(() => items.value.every((item) => !item.choice || !!choices.value[item.choice.optionId]))

function confirm() {
  if (!complete.value || props.saving) return
  emit(
    'confirm',
    Object.fromEntries(
      Object.entries(choices.value).map(([id, target]) => [id, target === LEAVE_EMPTY ? null : target]),
    ),
  )
}

function close() {
  if (!props.saving) emit('close')
}
</script>

<template>
  <Modal :open="conflicts.length > 0" aria-label="Confirm changes" max-width="480px" @close="close">
    <div class="modal-head"><h2>Confirm changes</h2></div>
    <div ref="body" class="confirm-body">
      <div v-if="stale" class="alert alert-info change-note" role="status">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
        <span>Questions changed since you opened the editor. These are the current counts.</span>
      </div>
      <p v-else>Saving changes existing questions. This can't be undone.</p>

      <div v-for="item in items" :key="item.key" class="change-item">
        <p>{{ item.text }}</p>
        <template v-if="item.choice">
          <Select
            v-model="choices[item.choice.optionId]"
            :aria-label="item.choice.label"
            :disabled="saving"
            :options="[
              ...item.choice.targets.map((t) => ({ value: t.value, label: `Move to ${t.label}` })),
              { value: LEAVE_EMPTY, label: 'Leave empty' },
            ]"
          />
          <p v-if="choices[item.choice.optionId] === LEAVE_EMPTY && item.choice.warning" class="change-warning">
            {{ item.choice.warning }}
          </p>
        </template>
      </div>
    </div>
    <div class="modal-foot change-foot">
      <Btn variant="secondary" :disabled="saving" @click="close">Cancel</Btn>
      <Btn variant="error" :disabled="!complete" :loading="saving" @click="confirm">Save changes</Btn>
    </div>
  </Modal>
</template>
