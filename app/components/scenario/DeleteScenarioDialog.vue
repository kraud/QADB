<script setup lang="ts">
import type { ScenarioSummary } from '#shared/types/qadb'
import { LAST_SCENARIO_COOKIE } from '~/utils/scenario-route'

const props = defineProps<{
  /** The scenario to delete; the dialog is open while there is one. */
  scenario: ScenarioSummary | null
}>()
const emit = defineEmits<{ (e: 'close'): void }>()

const api = useApi()
const { toast } = useToast()
const practice = usePracticeStore()
const lastOpened = useCookie<string | null>(LAST_SCENARIO_COOKIE)

const typed = ref('')
const deleting = ref(false)
const error = ref('')

watch(
  () => props.scenario?.id,
  () => {
    typed.value = ''
    deleting.value = false
    error.value = ''
  },
)

/** The server compares the same way. */
const matches = computed(() => typed.value.trim() === props.scenario?.name)

function close() {
  if (!deleting.value) emit('close')
}

async function remove() {
  if (!props.scenario || !matches.value || deleting.value) return
  const { id } = props.scenario
  deleting.value = true
  error.value = ''
  try {
    await api(`/api/scenarios/${encodeURIComponent(id)}`, { method: 'DELETE', body: { confirmName: typed.value } })
  } catch (err) {
    // Already gone is as good as deleted.
    if ((err as { statusCode?: number }).statusCode !== 404) {
      error.value = 'Could not delete this scenario. Please try again.'
      deleting.value = false
      return
    }
  }
  // Nothing may keep pointing at it.
  if (practice.scenarioId === id) practice.clear()
  if (lastOpened.value === id) lastOpened.value = null
  clearNuxtData(`scenario-${id}`)
  await refreshNuxtData('scenarios')
  toast('Scenario deleted')
  emit('close')
}
</script>

<template>
  <Modal :open="!!scenario" role="alertdialog" aria-label="Delete scenario" max-width="440px" @close="close">
    <form v-if="scenario" novalidate @submit.prevent="remove">
      <div class="modal-head"><h2>Delete scenario?</h2></div>
      <div class="confirm-body delete-body">
        <p>
          This permanently deletes <strong>{{ scenario.name }}</strong> with its
          <strong>{{ scenario.questionCount }} question{{ scenario.questionCount === 1 ? '' : 's' }}</strong>
          and their practice history. This can't be undone.
        </p>
        <div v-if="error" class="alert alert-error" role="alert">{{ error }}</div>
        <Input v-model="typed" label="Type the scenario name to confirm" autocomplete="off" />
      </div>
      <div class="modal-foot" style="padding-top: 14px">
        <Btn variant="secondary" :disabled="deleting" @click="close">Cancel</Btn>
        <Btn type="submit" variant="error" :disabled="!matches" :loading="deleting">Delete scenario</Btn>
      </div>
    </form>
  </Modal>
</template>
