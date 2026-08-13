<script setup lang="ts">
import type { Filters, QuestionWithStats, SortKey } from '#shared/types/qadb'
import { shuffle } from '~/utils/shuffle'

const api = useApi()
const { toast } = useToast()
const practice = usePracticeStore()

const filters = reactive<Filters>({
  diff: [],
  imp: [],
  cat: [],
  nbd: 'all',
  mastered: 'all',
  op: '>',
  n: 0,
  recent: false,
})

const sortKey = ref<SortKey>('')
const sortDir = ref<'asc' | 'desc'>('asc')
const selection = ref<string[]>([])
const followOrder = ref(true)
const questions = ref<QuestionWithStats[]>([])
const loading = ref(true)
const hasLoaded = ref(false)
const mobileFiltersOpen = ref(false)

const editorOpen = ref(false)
const editingId = ref<string | null>(null)
const confirmOpen = ref(false)
const deletingId = ref<string | null>(null)
const deletingAttemptCount = ref(0)

const activeCount = computed(() => {
  let n = 0
  if (filters.diff.length) n++
  if (filters.imp.length) n++
  if (filters.cat.length) n++
  if (filters.nbd !== 'all') n++
  if (filters.mastered !== 'all') n++
  if (filters.op !== '>' || filters.n > 0) n++
  if (filters.recent) n++
  return n
})

const hasActiveFilters = computed(() => activeCount.value > 0)

function buildQuery(): string {
  const qs = new URLSearchParams()
  for (const v of filters.diff) qs.append('difficulty', v)
  for (const v of filters.imp) qs.append('importance', v)
  for (const v of filters.cat) qs.append('category', v)
  if (filters.nbd !== 'all') qs.set('nbd', filters.nbd === 'yes' ? 'true' : 'false')
  if (filters.mastered !== 'all') qs.set('mastered', filters.mastered === 'yes' ? 'true' : 'false')
  if (filters.n > 0) {
    qs.set('amountOp', filters.op)
    qs.set('amountValue', String(filters.n))
  }
  if (filters.recent) qs.set('recentlyFailed', 'true')
  if (sortKey.value) qs.set('sortKey', sortKey.value)
  if (sortDir.value !== 'asc') qs.set('sortDir', sortDir.value)
  const s = qs.toString()
  return s ? `?${s}` : ''
}

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

async function fetchQuestions() {
  if (!hasLoaded.value) loading.value = true
  const data = await api<QuestionWithStats[]>('/api/questions' + buildQuery())
  questions.value = data
  reAnchorSelection()
  hasLoaded.value = true
  loading.value = false
}

function resetFilters() {
  filters.diff = []
  filters.imp = []
  filters.cat = []
  filters.nbd = 'all'
  filters.mastered = 'all'
  filters.op = '>'
  filters.n = 0
  filters.recent = false
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
  navigateTo(`/questions/${id}`)
}

function startPractice() {
  const queue = followOrder.value ? [...selection.value] : shuffle(selection.value)
  practice.start('curated', queue)
  navigateTo('/practice')
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
  <div class="content-wrap">
    <div class="content-head">
      <div>
        <h1>Content</h1>
        <p class="sub">Your question bank — filter, sort, select, then practice.</p>
      </div>
      <Btn variant="secondary" @click="addQuestion">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" style="width: 14px; height: 14px"><path d="M12 5v14M5 12h14" /></svg>
        Add question
      </Btn>
    </div>

    <button class="btn btn-secondary mobile-filters-btn" @click="mobileFiltersOpen = !mobileFiltersOpen">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" style="width: 14px; height: 14px"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
      Filters <span v-if="activeCount">· {{ activeCount }} active</span>
    </button>

    <div class="content-grid">
      <FiltersPanel :filters="filters" :open="mobileFiltersOpen" @change="fetchQuestions" @reset="resetFilters" />

      <div>
        <div class="list-top">
          <SortControl v-model:sort-key="sortKey" v-model:sort-dir="sortDir" />
          <div v-if="selection.length" class="selection-bar">
            <span class="count">{{ selection.length }} selected</span>
            <Switch v-model="followOrder" size="sm" label="Follow current sort/order" />
            <Btn size="sm" @click="startPractice">Start practice</Btn>
          </div>
        </div>


        <template v-if="loading">
          <div class="table-wrap">
            <table class="qtable sk-table">
              <tbody>
                <tr v-for="i in 8" :key="i">
                  <td class="col-check"><Skeleton width="18px" height="18px" /></td>
                  <td class="col-q"><Skeleton :width="`${72 - i * 3}%`" /></td>
                  <td><Skeleton width="56px" height="20px" radius="999px" /></td>
                  <td><Skeleton width="48px" height="20px" radius="999px" /></td>
                  <td><Skeleton width="42px" height="20px" radius="999px" /></td>
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
