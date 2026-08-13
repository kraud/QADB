<script setup lang="ts">
defineProps<{ sortKey: string; sortDir: string }>()
const emit = defineEmits<{
  (e: 'update:sortKey', v: string): void
  (e: 'update:sortDir', v: string): void
}>()
</script>

<template>
  <div class="sort-ctl">
    <select
      class="select"
      aria-label="Sort by"
      :value="sortKey"
      @change="emit('update:sortKey', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">Sort by · Default</option>
      <option value="difficulty">Difficulty</option>
      <option value="importance">Importance</option>
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
