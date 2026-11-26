<script setup lang="ts">
import { colorVar } from '#shared/scenario/colors'
import { countActiveFilters, type Filters } from '#shared/scenario/query'
import type { Scenario } from '#shared/scenario/types'

const props = defineProps<{ scenario: Scenario; filters: Filters; open?: boolean }>()
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

const activeCount = computed(() => countActiveFilters(props.filters, props.scenario))

/** Adds or removes an option id (`options`) or an attribute id (`none`). */
function toggle(list: string[], id: string) {
  const i = list.indexOf(id)
  if (i >= 0) list.splice(i, 1)
  else list.push(id)
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
  props.filters.op = (e.target as HTMLSelectElement).value as Filters['op']
  emit('change')
}
</script>

<template>
  <aside class="filters" :class="{ open }">
    <div v-for="attribute in scenario.attributes" :key="attribute.id" class="filter-group" role="group" :aria-label="attribute.name">
      <p class="filter-title">{{ attribute.name }}</p>
      <div class="chip-group">
        <Chip
          v-for="option in attribute.options"
          :key="option.id"
          :active="filters.options.includes(option.id)"
          :color="colorVar(option.color)"
          @click="toggle(filters.options, option.id)"
        >
          {{ option.label }}
        </Chip>
        <Chip :active="filters.none.includes(attribute.id)" @click="toggle(filters.none, attribute.id)">None</Chip>
      </div>
    </div>

    <div class="filter-group" role="group" aria-label="Never been done">
      <p class="filter-title">Never been done <span class="tip">— no attempts yet</span></p>
      <Seg :model-value="filters.nbd" :options="nbdOptions" @update:model-value="setSeg('nbd', $event)" />
    </div>

    <div class="filter-group" role="group" aria-label="Mastered">
      <p class="filter-title">Mastered</p>
      <Seg :model-value="filters.mastered" :options="masteredOptions" @update:model-value="setSeg('mastered', $event)" />
    </div>

    <div class="filter-group" role="group" aria-label="Track record amount">
      <p class="filter-title">Track record amount</p>
      <div class="filter-row">
        <select class="select" aria-label="Operator" :value="filters.op" @change="onOpChange">
          <option value="all">all</option>
          <option value=">">&gt;</option>
          <option value="<">&lt;</option>
          <option value="=">=</option>
        </select>
        <input class="input num" type="number" min="0" step="1" :value="filters.n || ''" placeholder="0" aria-label="Practice count" :disabled="filters.op === 'all'" @input="onAmountInput" />
      </div>
    </div>

    <div class="filter-group" role="group" aria-label="Recently failed">
      <p class="filter-title">Recently failed</p>
      <Switch
        :model-value="filters.recent"
        label="Last attempt incorrect"
        aria-label="Only questions whose last attempt was incorrect"
        @update:model-value="filters.recent = $event; emit('change')"
      />
    </div>

    <div v-if="scenario.attributes.length" class="filter-group" role="group" aria-label="Missing values">
      <p class="filter-title">Missing values <span class="tip">— required ones</span></p>
      <Switch
        :model-value="filters.incomplete"
        label="Incomplete"
        @update:model-value="filters.incomplete = $event; emit('change')"
      />
    </div>

    <div class="filter-footer">
      <span class="active-count"><b>{{ activeCount }}</b> active</span>
      <Btn variant="ghost" size="sm" @click="emit('reset')">Reset filters</Btn>
    </div>
  </aside>
</template>
