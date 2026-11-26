<script setup lang="ts">
import type { SortDir, SortKey } from '#shared/scenario/query'
import type { Attribute } from '#shared/scenario/types'

const props = defineProps<{ sortKey: SortKey; sortDir: SortDir; attributes: Attribute[] }>()
const emit = defineEmits<{
  (e: 'update:sortKey', v: SortKey): void
  (e: 'update:sortDir', v: SortDir): void
}>()

const ordered = computed(() => props.attributes.filter((attribute) => attribute.ordered))
</script>

<template>
  <div class="sort-ctl">
    <select
      class="select"
      aria-label="Sort by"
      :value="sortKey"
      @change="emit('update:sortKey', ($event.target as HTMLSelectElement).value as SortKey)"
    >
      <option value="">Sort by · Default</option>
      <option v-for="attribute in ordered" :key="attribute.id" :value="`attr:${attribute.id}`">{{ attribute.name }}</option>
      <option value="pct">Track record %</option>
      <option value="amount">Track record amount</option>
    </select>
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
