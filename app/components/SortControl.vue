<script setup lang="ts">
import type { SortDir, SortKey } from '#shared/scenario/query'
import type { Attribute } from '#shared/scenario/types'

const props = defineProps<{ sortKey: SortKey; sortDir: SortDir; attributes: Attribute[] }>()
const emit = defineEmits<{
  (e: 'update:sortKey', v: SortKey): void
  (e: 'update:sortDir', v: SortDir): void
}>()

const options = computed(() => [
  { value: '', label: 'Sort by · Default' },
  ...props.attributes.filter((attribute) => attribute.ordered).map((a) => ({ value: `attr:${a.id}`, label: a.name })),
  { value: 'pct', label: 'Track record %' },
  { value: 'amount', label: 'Track record amount' },
])
</script>

<template>
  <div class="sort-ctl">
    <Select
      aria-label="Sort by"
      size="sm"
      :model-value="sortKey"
      :options="options"
      @update:model-value="emit('update:sortKey', $event as SortKey)"
    />
    <button
      class="dir-btn"
      :aria-label="sortDir === 'asc' ? 'Sort ascending' : 'Sort descending'"
      title="Ascending / Descending"
      @click="emit('update:sortDir', sortDir === 'asc' ? 'desc' : 'asc')"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path v-if="sortDir === 'asc'" d="M7 15l5 5 5-5M12 4v16" />
        <path v-else d="M7 9l5-5 5 5M12 19V3" />
      </svg>
    </button>
  </div>
</template>
