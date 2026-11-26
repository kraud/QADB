<script setup lang="ts">
import { buildQuestionQuery, countActiveFilters, emptyFilters, type Filters, type SortDir, type SortKey } from '#shared/scenario/query'
import type { QuestionWithStats } from '#shared/types/qadb'
import { practicePath, questionPath } from '~/utils/scenario-route'
import { shuffle } from '~/utils/shuffle'

// One page instance per scenario: switching starts with fresh filters, sort, selection and results.
definePageMeta({ key: (route) => String(route.params.sid) })

const route = useRoute()
const sid = String(route.params.sid)

const api = useApi()
const { toast } = useToast()
const practice = usePracticeStore()
const {
  scenario,
  error: scenarioError,
  refresh: refreshScenario,
} = useScenario(computed(() => sid))

const filters = reactive<Filters>(emptyFilters())

const sortKey = ref<SortKey>('')
const sortDir = ref<SortDir>('asc')
const selection = ref<string[]>([])
const followOrder = ref(true)
const questions = ref<QuestionWithStats[]>([])
const loading = ref(true)
const loadError = ref(false)
const hasLoaded = ref(false)
const mobileFiltersOpen = ref(false)

const editorOpen = ref(false)
const editingId = ref<string | null>(null)
const confirmOpen = ref(false)
const deletingId = ref<string | null>(null)
const deletingAttemptCount = ref(0)

/** Missing, or someone else's. */
const notFound = computed(() => scenarioError.value?.statusCode === 404)

const activeCount = computed(() => (scenario.value ? countActiveFilters(filters, scenario.value) : 0))
const hasActiveFilters = computed(() => activeCount.value > 0)

function orderSelection() {
  const order = questions.value.map((q) => q.id)
  selection.value = selection.value
    .filter((id) => order.includes(id))
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
}

function reAnchorSelection() {
  const before = selection.value.length
  orderSelection()
  if (selection.value.length !== before) {
    toast('Selection adjusted to the current results')
  }
}

/** Counts the list requests; only the answer to the newest one is used. */
let latestRequest = 0
let left = false

async function fetchQuestions() {
  if (left) return
  const request = ++latestRequest
  if (!hasLoaded.value) loading.value = true
  loadError.value = false
  try {
    const query = buildQuestionQuery(filters, sortKey.value, sortDir.value)
    const data = await api<QuestionWithStats[]>(`/api/scenarios/${encodeURIComponent(sid)}/questions${query}`)
    if (request !== latestRequest) return
    questions.value = data
    reAnchorSelection()
    hasLoaded.value = true
  } catch (err) {
    if (request !== latestRequest) return
    loadError.value = true
    // Deleted since it was opened: reading it again shows the 404 panel.
    if ((err as { statusCode?: number }).statusCode === 404 && scenario.value) refreshScenario()
  }
  loading.value = false
}

/** Reloads whatever failed: the scenario, the list, or both. */
async function retry() {
  if (!scenario.value) await refreshScenario()
  await fetchQuestions()
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
function onSearchInput(e: Event) {
  filters.q = (e.target as HTMLInputElement).value
  clearTimeout(searchTimer)
  searchTimer = setTimeout(fetchQuestions, 250)
}
onBeforeUnmount(() => {
  left = true
  latestRequest++
  clearTimeout(searchTimer)
})

function resetFilters() {
  clearTimeout(searchTimer)
  Object.assign(filters, emptyFilters())
  fetchQuestions()
}

function toggleRow(id: string) {
  if (selection.value.includes(id)) {
    selection.value = selection.value.filter((x) => x !== id)
  } else {
    selection.value.push(id)
    orderSelection()
  }
}

function selectAll(checked: boolean) {
  const visible = questions.value.map((q) => q.id)
  if (checked) {
    selection.value = [...visible]
  } else {
    selection.value = selection.value.filter((id) => !visible.includes(id))
  }
}

function openQuestion(id: string) {
  navigateTo(questionPath(sid, id))
}

function startPractice() {
  const queue = followOrder.value ? [...selection.value] : shuffle(selection.value)
  practice.start('curated', queue, sid)
  navigateTo(practicePath(sid))
}

function addQuestion() {
  editingId.value = null
  editorOpen.value = true
}

function editQuestion(id: string) {
  editingId.value = id
  editorOpen.value = true
}

function deleteQuestion(id: string) {
  const q = questions.value.find((x) => x.id === id)
  deletingId.value = id
  deletingAttemptCount.value = q?.stats.attemptCount ?? 0
  confirmOpen.value = true
}

function onEditorSaved() {
  editorOpen.value = false
  toast(editingId.value ? 'Question updated' : 'Question added')
  fetchQuestions()
}

function onEditorRequestDelete(id: string) {
  editorOpen.value = false
  const q = questions.value.find((x) => x.id === id)
  deletingId.value = id
  deletingAttemptCount.value = q?.stats.attemptCount ?? 0
  confirmOpen.value = true
}

async function onDeleteConfirmed(id: string) {
  confirmOpen.value = false
  await api(`/api/questions/${id}`, { method: 'DELETE' })
  selection.value = selection.value.filter((x) => x !== id)
  toast('Question deleted')
  fetchQuestions()
}

watch([sortKey, sortDir], fetchQuestions)
onMounted(fetchQuestions)
</script>

<template>
  <div v-if="notFound" class="notfound">
    <p class="code">404 · PAGE NOT FOUND</p>
    <h1>This page doesn't exist.</h1>
    <p>The link may be broken, or the page moved.</p>
    <Btn to="/">Back to content</Btn>
  </div>

  <div v-else class="content-wrap">
    <div class="content-head">
      <div>
        <h1>Content</h1>
        <p class="sub">Your question bank — filter, sort, select, then practice.</p>
      </div>
      <Btn variant="secondary" :disabled="!scenario" @click="addQuestion">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" style="width: 14px; height: 14px"><path d="M12 5v14M5 12h14" /></svg>
        Add question
      </Btn>
    </div>

    <button type="button" class="btn btn-secondary mobile-filters-btn" @click="mobileFiltersOpen = !mobileFiltersOpen">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" style="width: 14px; height: 14px"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
      Filters <span v-if="activeCount">· {{ activeCount }} active</span>
    </button>

    <div class="content-grid">
      <FiltersPanel v-if="scenario" :scenario="scenario" :filters="filters" :open="mobileFiltersOpen" @change="fetchQuestions" @reset="resetFilters" />
      <aside v-else class="filters" :class="{ open: mobileFiltersOpen }" aria-label="Filters">
        <Skeleton v-for="i in 4" :key="i" height="46px" style="margin-bottom: 12px" />
      </aside>

      <div>
        <div class="list-top">
          <div class="list-top-left">
            <div class="search-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <input class="input" type="search" :value="filters.q" placeholder="Search questions" aria-label="Search questions" @input="onSearchInput" />
            </div>
            <SortControl v-model:sort-key="sortKey" v-model:sort-dir="sortDir" :attributes="scenario?.attributes ?? []" />
          </div>
          <div v-if="selection.length" class="selection-bar">
            <span class="count">{{ selection.length }} selected</span>
            <Switch v-model="followOrder" size="sm" label="Follow current sort/order" />
            <Btn size="sm" @click="startPractice">Start practice</Btn>
          </div>
        </div>


        <Empty v-if="loadError || (scenarioError && !scenario)" title="Couldn't load your questions" text="Something went wrong fetching your question bank. Check your connection and try again.">
          <template #icon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 9v4M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
          </template>
          <Btn variant="secondary" size="sm" @click="retry">Try again</Btn>
        </Empty>

        <template v-else-if="loading || !scenario">
          <div class="table-wrap">
            <table class="qtable sk-table">
              <tbody>
                <tr v-for="i in 8" :key="i">
                  <td class="col-check"><Skeleton width="18px" height="18px" /></td>
                  <td class="col-q"><Skeleton :width="`${72 - i * 3}%`" /></td>
                  <td v-for="n in scenario?.attributes.length ?? 3" :key="n"><Skeleton width="48px" height="20px" radius="999px" /></td>
                  <td class="col-num"><Skeleton width="34px" /></td>
                  <td class="col-num"><Skeleton width="46px" /></td>
                  <td class="col-num"><Skeleton width="60px" /></td>
                  <td><Skeleton width="26px" height="20px" radius="999px" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <template v-else-if="questions.length">
          <QuestionTable
            :scenario="scenario"
            :questions="questions"
            :selection="selection"
            @open="openQuestion"
            @toggle="toggleRow"
            @select-all="selectAll"
            @edit="editQuestion"
            @remove="deleteQuestion"
          />
        </template>

        <Empty v-else-if="hasActiveFilters" title="No questions match these filters" text="Try loosening a filter or reset to see the whole bank.">
          <template #icon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7h16M4 12h10M4 17h7" /></svg>
          </template>
          <Btn variant="secondary" size="sm" @click="resetFilters">Reset filters</Btn>
        </Empty>

        <Empty v-else title="No questions yet" text="Add your first question to start building your bank.">
          <template #icon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12h14" /></svg>
          </template>
          <Btn @click="addQuestion">Add your first question</Btn>
        </Empty>
      </div>
    </div>
  </div>

  <QuestionEditorModal
    :open="editorOpen"
    :question-id="editingId"
    :scenario="scenario"
    @close="editorOpen = false"
    @saved="onEditorSaved"
    @request-delete="onEditorRequestDelete"
  />
  <ConfirmDialog
    :open="confirmOpen"
    :attempt-count="deletingAttemptCount"
    :question-id="deletingId"
    @close="confirmOpen = false"
    @confirmed="onDeleteConfirmed"
  />
</template>
