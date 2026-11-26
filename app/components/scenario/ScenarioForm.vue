<script setup lang="ts">
import { findConflicts, type Conflict, type Resolutions } from '#shared/scenario/diff'
import { scenarioInputSchema, type ScenarioInput } from '#shared/scenario/schema'
import type { Scenario } from '#shared/scenario/types'
import type { ScenarioDetail } from '#shared/types/qadb'
import { keepFocus } from '~/composables/keepFocus'
import { buildResolutions, emptyForm, fieldErrors, move, newAttribute, toForm, type AttributeForm } from '~/utils/scenario-form'
import { contentPath } from '~/utils/scenario-route'

const props = defineProps<{
  /** The scenario being edited; absent for a new one. */
  original?: ScenarioDetail
}>()

const api = useApi()
const { toast } = useToast()

const form = reactive<ScenarioInput>(props.original ? toForm(props.original) : emptyForm())

/** Text is saved trimmed, so spaces around it are no change. */
const snapshot = () => JSON.stringify(form, (_, value) => (typeof value === 'string' ? value.trim() : value))
const initial = snapshot()
const dirty = computed(() => snapshot() !== initial)

// ─── errors ──────────────────────────────────────────────────────────────

/** Saving has been tried: from then on the fields are checked as they change. */
const submitted = ref(false)
const serverIssues = ref<{ path?: (string | number)[]; message: string }[]>([])
const failure = ref('')

const errors = computed(() => {
  const server = fieldErrors(serverIssues.value)
  const own = submitted.value ? scenarioInputSchema.safeParse(form).error?.issues : undefined
  const client = fieldErrors(own ?? [])
  return { fields: { ...server.fields, ...client.fields }, other: [...client.other, ...server.other] }
})
const alerts = computed(() => (failure.value ? [failure.value] : errors.value.other))

// The server's findings are about what was sent; any change may have answered them.
watch(
  () => snapshot(),
  () => {
    serverIssues.value = []
    failure.value = ''
  },
)

const root = ref<HTMLElement | null>(null)

async function showFirstError() {
  await nextTick()
  const first = root.value?.querySelector<HTMLElement>('.field.invalid input, .options-err, .alert-error')
  if (!first) return
  first.focus({ preventScroll: true })
  first.scrollIntoView({ block: 'center' })
}

// ─── attributes ──────────────────────────────────────────────────────────

// A new attribute has no id, and moving it must move its card.
const keys = new WeakMap<AttributeForm, number>()
let lastKey = 0
function keyOf(attribute: AttributeForm) {
  if (!keys.has(attribute)) keys.set(attribute, ++lastKey)
  return keys.get(attribute)!
}

async function appendAttribute() {
  form.attributes.push(newAttribute())
  await nextTick()
  root.value?.querySelector<HTMLElement>('.attr-card:last-of-type input')?.focus()
}

function moveAttribute(index: number, by: -1 | 1, button: EventTarget | null) {
  move(form.attributes, index, index + by)
  keepFocus(button)
}

// ─── saving ──────────────────────────────────────────────────────────────

const saving = ref(false)
/** What the changes dialog asks about; it is open while there is something. */
const conflicts = ref<Conflict[]>([])
const stale = ref(false)
/** The scenario that names what the dialog is about. */
const known = ref<Scenario | null>(props.original ?? null)
/** What is being saved, with the choices confirmed so far. */
const pending = shallowRef<{ scenario: ScenarioInput; resolutions: Resolutions } | null>(null)

/** Nothing is left to lose, so leaving asks nothing. */
let saved = false
let left = false
onBeforeUnmount(() => (left = true))

function save() {
  if (saving.value || conflicts.value.length) return
  submitted.value = true
  serverIssues.value = []
  failure.value = ''
  const parsed = scenarioInputSchema.safeParse(form)
  if (!parsed.success) return showFirstError()

  // Choices are made anew for each save: the form may have changed since the last one.
  pending.value = { scenario: parsed.data, resolutions: {} }
  stale.value = false
  if (props.original) {
    conflicts.value = findConflicts(props.original, parsed.data, props.original.usage, {})
    if (conflicts.value.length) return
  }
  return send()
}

function confirmChanges(moveTo: Record<string, string | null>) {
  if (!pending.value || saving.value) return
  const { scenario, resolutions } = pending.value
  pending.value = { scenario, resolutions: buildResolutions(resolutions, conflicts.value, moveTo) }
  return send()
}

interface RequestError {
  statusCode?: number
  /** The response body. */
  data?: { statusMessage?: string; data?: unknown }
}

async function send() {
  const request = pending.value!
  saving.value = true
  let result: Scenario
  try {
    result = props.original
      ? await api<Scenario>(`/api/scenarios/${encodeURIComponent(props.original.id)}`, { method: 'PUT', body: request })
      : await api<Scenario>('/api/scenarios', { method: 'POST', body: request.scenario })
  } catch (err) {
    await handle(err as RequestError)
    saving.value = false
    return
  }

  saved = true
  conflicts.value = []
  // Whatever was read of this scenario before is out of date, and so is the list.
  clearNuxtData(`scenario-${result.id}`)
  await refreshNuxtData('scenarios')
  if (left) return
  toast(props.original ? 'Scenario saved' : 'Scenario created')
  await navigateTo(contentPath(result.id))
}

async function handle({ statusCode, data }: RequestError) {
  const details = data?.data
  const found = (details as { conflicts?: Conflict[] } | undefined)?.conflicts
  if (statusCode === 409 && found?.length) {
    try {
      known.value = await api<Scenario>(`/api/scenarios/${encodeURIComponent(props.original!.id)}`)
    } catch {
      // The names read when the editor opened will do.
    }
    stale.value = true
    conflicts.value = found
    return
  }

  conflicts.value = []
  if (statusCode === 409 && data?.statusMessage) {
    serverIssues.value = [{ path: ['name'], message: data.statusMessage }]
  } else if (statusCode === 422 && Array.isArray(details) && details.length) {
    serverIssues.value = details
  } else {
    failure.value = statusCode === 404 ? 'This scenario no longer exists.' : 'Something went wrong. Please try again.'
  }
  await showFirstError()
}

// ─── leaving ─────────────────────────────────────────────────────────────

const asking = ref(false)
let answer: ((leave: boolean) => void) | undefined

function decide(leave: boolean) {
  asking.value = false
  answer?.(leave)
  answer = undefined
}

onBeforeRouteLeave((to) => {
  // An ended session leads to the login screen whatever the form holds.
  if (saved || !dirty.value || to.path === '/login') return true
  // A second attempt to leave replaces the one still waiting.
  answer?.(false)
  asking.value = true
  return new Promise<boolean>((resolve) => (answer = resolve))
})

/** Enter saves from the name field only: elsewhere it is too easy to hit while still typing. */
function holdEnter(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement) e.preventDefault()
}
</script>

<template>
  <form ref="root" class="scenario-form" novalidate @submit.prevent="save">
    <div v-if="alerts.length" class="alert alert-error" role="alert" tabindex="-1">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
      <span><span v-for="(message, i) in alerts" :key="i" class="alert-line">{{ message }}</span></span>
    </div>

    <Input v-model="form.name" label="Scenario name" placeholder="e.g. Finance interview" :error="errors.fields.name" />

    <div class="attr-section" @keydown.enter="holdEnter">
      <div>
        <h2>Attributes</h2>
        <p class="helper">
          Attributes describe each question, such as a difficulty or a topic. You can filter by them.
        </p>
      </div>

      <AttributeCard
        v-for="(attribute, i) in form.attributes"
        :key="keyOf(attribute)"
        :attribute="attribute"
        :index="i"
        :count="form.attributes.length"
        :errors="errors.fields"
        @move="(by, button) => moveAttribute(i, by, button)"
        @remove="form.attributes.splice(i, 1)"
      />

      <p v-if="!form.attributes.length" class="attr-none">
        No attributes: a plain list of questions and answers.
      </p>

      <div>
        <Btn variant="secondary" size="sm" @click="appendAttribute">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" style="width: 14px; height: 14px"><path d="M12 5v14M5 12h14" /></svg>
          Add attribute
        </Btn>
      </div>
    </div>

    <div class="form-foot">
      <Btn variant="secondary" @click="navigateTo('/scenarios')">Cancel</Btn>
      <Btn type="submit" :loading="saving">Save scenario</Btn>
    </div>
  </form>

  <ResolveChangesDialog
    :conflicts="conflicts"
    :current="known"
    :next="pending?.scenario ?? null"
    :stale="stale"
    :saving="saving"
    @close="conflicts = []"
    @confirm="confirmChanges"
  />

  <Modal :open="asking" role="alertdialog" aria-label="Discard changes?" max-width="440px" @close="decide(false)">
    <div class="modal-head"><h2>Discard changes?</h2></div>
    <div class="confirm-body">
      <p>Your edits to this scenario will be lost.</p>
    </div>
    <div class="modal-foot" style="padding-top: 8px">
      <Btn variant="secondary" @click="decide(false)">Keep editing</Btn>
      <Btn variant="error" @click="decide(true)">Discard</Btn>
    </div>
  </Modal>
</template>
