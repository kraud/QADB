<script setup lang="ts">
import type { ScenarioSummary } from '#shared/types/qadb'
import { contentPath } from '~/utils/scenario-route'

const props = defineProps<{ scenarios: ScenarioSummary[]; currentId?: string }>()

const options = computed(() => [
  { value: '', label: 'All scenarios' },
  ...props.scenarios.map((s) => ({ value: s.id, label: s.name })),
])

function open(id: string) {
  navigateTo(id ? contentPath(id) : '/scenarios')
}
</script>

<template>
  <div class="scenario-switcher">
    <Select aria-label="Scenario" size="sm" :model-value="currentId ?? ''" :options="options" @update:model-value="open" />
  </div>
</template>
