<script setup lang="ts">
import type { Filters } from '#shared/types/qadb'
import { CATEGORY, CATEGORY_COLOR, DIFFICULTY, DIFFICULTY_LABEL, IMPORTANCE, IMPORTANCE_LABEL } from '#shared/enums'

const props = defineProps<{ filters: Filters; open?: boolean }>()
const emit = defineEmits<{ (e: 'change'): void; (e: 'reset'): void }>()

const nbdOptions = [
  { value: 'all', label: 'All' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]
const masteredOptions = [
  { value: 'all', label: 'All' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

const activeCount = computed(() => {
  let n = 0
  if (props.filters.diff.length) n++
  if (props.filters.imp.length) n++
  if (props.filters.cat.length) n++
  if (props.filters.nbd !== 'all') n++
  if (props.filters.mastered !== 'all') n++
  if (props.filters.op !== '>' || props.filters.n > 0) n++
  if (props.filters.recent) n++
  if (props.filters.q.trim()) n++
  return n
})

function toggle(list: string[], value: string) {
  const i = list.indexOf(value)
  if (i >= 0) list.splice(i, 1)
  else list.push(value)
  emit('change')
}

function setSeg(key: 'nbd' | 'mastered', value: string) {
  ;(props.filters[key] as string) = value
  emit('change')
}

function onAmountInput(e: Event) {
  props.filters.n = Number.parseInt((e.target as HTMLInputElement).value, 10) || 0
  emit('change')
}

function onOpChange(e: Event) {
  props.filters.op = (e.target as HTMLSelectElement).value as '>' | '<' | '='
  emit('change')
}

function reset() {
  props.filters.diff = []
  props.filters.imp = []
  props.filters.cat = []
  props.filters.nbd = 'all'
  props.filters.mastered = 'all'
  props.filters.op = '>'
  props.filters.n = 0
  props.filters.recent = false
  props.filters.q = ''
  emit('reset')
}
</script>

<template>
  <aside class="filters" :class="{ open }">
    <div class="filter-group">
      <p class="filter-title">Difficulty</p>
      <div class="chip-group">
        <Chip v-for="v in DIFFICULTY" :key="v" :active="filters.diff.includes(v)" @click="toggle(filters.diff, v)">
          {{ DIFFICULTY_LABEL[v as keyof typeof DIFFICULTY_LABEL] }}
        </Chip>
      </div>
    </div>

    <div class="filter-group">
      <p class="filter-title">Importance</p>
      <div class="chip-group">
        <Chip v-for="v in IMPORTANCE" :key="v" :active="filters.imp.includes(v)" @click="toggle(filters.imp, v)">
          {{ IMPORTANCE_LABEL[v as keyof typeof IMPORTANCE_LABEL] }}
        </Chip>
      </div>
    </div>

    <div class="filter-group">
      <p class="filter-title">Category</p>
      <div class="chip-group">
        <Chip v-for="v in CATEGORY" :key="v" :active="filters.cat.includes(v)" :color="CATEGORY_COLOR[v as keyof typeof CATEGORY_COLOR]" @click="toggle(filters.cat, v)">
          {{ v }}
        </Chip>
      </div>
    </div>

    <div class="filter-group">
      <p class="filter-title">Never been done <span class="tip">— no attempts yet</span></p>
      <Seg :model-value="filters.nbd" :options="nbdOptions" @update:model-value="setSeg('nbd', $event)" />
    </div>

    <div class="filter-group">
      <p class="filter-title">Mastered</p>
      <Seg :model-value="filters.mastered" :options="masteredOptions" @update:model-value="setSeg('mastered', $event)" />
    </div>

    <div class="filter-group">
      <p class="filter-title">Track record amount</p>
      <div class="filter-row">
        <select class="select" aria-label="Operator" :value="filters.op" @change="onOpChange">
          <option value=">">&gt;</option>
          <option value="<">&lt;</option>
          <option value="=">=</option>
        </select>
        <input class="input num" type="number" min="0" step="1" :value="filters.n || ''" placeholder="0" aria-label="Practice count" @input="onAmountInput" />
      </div>
    </div>

    <div class="filter-group">
      <p class="filter-title">Recently failed</p>
      <Switch
        :model-value="filters.recent"
        label="Last attempt incorrect"
        aria-label="Only questions whose last attempt was incorrect"
        @update:model-value="filters.recent = $event; emit('change')"
      />
    </div>

    <div class="filter-footer">
      <span class="active-count"><b>{{ activeCount }}</b> active</span>
      <Btn variant="ghost" size="sm" @click="reset">Reset filters</Btn>
    </div>
  </aside>
</template>
