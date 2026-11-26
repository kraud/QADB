<script setup lang="ts">
import { colorVar } from '#shared/scenario/colors'
import { countActiveFilters, type Filters } from '#shared/scenario/query'
import type { Attribute, Scenario } from '#shared/scenario/types'

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

/** Stands for the "None" chip among an attribute's options: ids have no colon. */
const NONE = ':none'

const chosen = (attribute: Attribute) => [
  ...attribute.options.map((o) => o.id).filter((id) => props.filters.options.includes(id)),
  ...(props.filters.none.includes(attribute.id) ? [NONE] : []),
]

function setChosen(attribute: Attribute, next: string[]) {
  const own = new Set(attribute.options.map((o) => o.id))
  props.filters.options = [...props.filters.options.filter((id) => !own.has(id)), ...next.filter((id) => id !== NONE)]
  props.filters.none = [
    ...props.filters.none.filter((id) => id !== attribute.id),
    ...(next.includes(NONE) ? [attribute.id] : []),
  ]
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

const operatorOptions = ['all', '>', '<', '='].map((value) => ({ value, label: value }))

function onOpChange(op: string) {
  props.filters.op = op as typeof props.filters.op
  emit('change')
}
</script>

<template>
  <aside class="filters" :class="{ open }">
    <div v-for="attribute in scenario.attributes" :key="attribute.id" class="filter-group" role="group" :aria-label="attribute.name">
      <p class="filter-title">{{ attribute.name }}</p>
      <ChipGroup type="multiple" :model-value="chosen(attribute)" @update:model-value="setChosen(attribute, $event)">
        <Chip v-for="option in attribute.options" :key="option.id" :value="option.id" :color="colorVar(option.color)">
          {{ option.label }}
        </Chip>
        <Chip :value="NONE">None</Chip>
      </ChipGroup>
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
        <Select aria-label="Operator" size="sm" :model-value="filters.op" :options="operatorOptions" @update:model-value="onOpChange" />
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
