<script setup lang="ts">
import { colorVar } from '#shared/scenario/colors'
import type { AttributeValues, Scenario } from '#shared/scenario/types'

const props = defineProps<{ scenario: Pick<Scenario, 'attributes'>; values: AttributeValues; blurred?: boolean }>()

/** Each attribute with its chosen options, both in scenario order. */
const groups = computed(() =>
  props.scenario.attributes.map((attribute) => ({
    id: attribute.id,
    name: attribute.name,
    chosen: attribute.options.filter((option) => props.values[attribute.id]?.includes(option.id)),
  })),
)
</script>

<template>
  <span class="attr-badges">
    <span v-for="group in groups" :key="group.id" class="attr-group" :title="group.name">
      <Badge
        v-for="option in group.chosen"
        :key="option.id"
        :tone="blurred ? 'neutral' : 'option'"
        :color="blurred ? undefined : colorVar(option.color)"
        :class="{ blurred }"
      >{{ option.label }}</Badge>
      <span v-if="!group.chosen.length" class="blank">—</span>
    </span>
  </span>
</template>
