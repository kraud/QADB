<script setup lang="ts">
import type { OptionForm } from '~/utils/scenario-form'

const props = defineProps<{ option: OptionForm; index: number; count: number; error?: string }>()
const emit = defineEmits<{
  (e: 'move', by: -1 | 1, button: EventTarget | null): void
  (e: 'default', value: boolean): void
  (e: 'remove'): void
}>()

/** What the row and its delete button are called: the label, or the position while there is none. */
const name = computed(() => props.option.label.trim() || String(props.index + 1))
</script>

<template>
  <div class="option-row" role="group" :aria-label="`Option: ${name}`">
    <ColorPicker v-model="option.color" />
    <Input v-model="option.label" class="option-label" aria-label="Option label" placeholder="Option label" :error="error" />
    <Switch
      class="option-default"
      :model-value="option.isDefault"
      size="sm"
      label="Default"
      @update:model-value="emit('default', $event)"
    />
    <div class="option-actions">
      <button type="button" class="btn-icon" aria-label="Move up" title="Move up" :disabled="index === 0" @click="emit('move', -1, $event.currentTarget)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
      </button>
      <button type="button" class="btn-icon" aria-label="Move down" title="Move down" :disabled="index === count - 1" @click="emit('move', 1, $event.currentTarget)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
      </button>
      <button type="button" class="btn-icon danger" :aria-label="`Delete option ${name}`" title="Delete option" @click="emit('remove')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
      </button>
    </div>
  </div>
</template>
