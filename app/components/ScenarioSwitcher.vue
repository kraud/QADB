<script setup lang="ts">
import type { ScenarioSummary } from '#shared/types/qadb'
import { contentPath } from '~/utils/scenario-route'

defineProps<{ scenarios: ScenarioSummary[]; currentId?: string }>()

function open(e: Event) {
  const id = (e.target as HTMLSelectElement).value
  navigateTo(id ? contentPath(id) : '/scenarios')
}
</script>

<template>
  <div class="scenario-switcher">
    <select class="select" aria-label="Scenario" :value="currentId ?? ''" @change="open">
      <option value="" :selected="!currentId">All scenarios</option>
      <option v-for="s in scenarios" :key="s.id" :value="s.id" :selected="s.id === currentId">{{ s.name }}</option>
    </select>
  </div>
</template>
