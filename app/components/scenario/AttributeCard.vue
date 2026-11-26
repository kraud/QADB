<script setup lang="ts">
import type { SelectionMode } from '#shared/scenario/types'
import { addOption, move, setDefault, setSelectionMode, type AttributeForm } from '~/utils/scenario-form'
import { keepFocus } from '~/composables/keepFocus'

const props = defineProps<{
  /** Edited in place. */
  attribute: AttributeForm
  index: number
  count: number
  /** Messages by field path, e.g. `attributes.0.name`. */
  errors: Record<string, string>
}>()
const emit = defineEmits<{
  (e: 'move', by: -1 | 1, button: EventTarget | null): void
  (e: 'remove'): void
}>()

const MIN_OPTIONS = 2

const name = computed(() => props.attribute.name.trim() || String(props.index + 1))
const path = computed(() => `attributes.${props.index}`)
const multiple = computed(() => props.attribute.selectionMode === 'multiple')

const modes = [
  { value: 'single', label: 'Single' },
  { value: 'multiple', label: 'Multiple' },
]

/** Someone tried to delete one of the last options. */
const blocked = ref(false)
watch(
  () => props.attribute.options.length,
  () => (blocked.value = false),
)

const optionsError = computed(() =>
  blocked.value
    ? 'An attribute needs at least 2 options. Add another before deleting one.'
    : props.errors[`${path.value}.options`],
)

function removeOption(index: number) {
  if (props.attribute.options.length <= MIN_OPTIONS) blocked.value = true
  else props.attribute.options.splice(index, 1)
}

function moveOption(index: number, by: -1 | 1, button: EventTarget | null) {
  move(props.attribute.options, index, index + by)
  keepFocus(button)
}

const optionList = ref<HTMLElement | null>(null)
async function appendOption() {
  addOption(props.attribute)
  await nextTick()
  optionList.value?.querySelector<HTMLElement>('.option-row:last-of-type input')?.focus()
}
</script>

<template>
  <section class="attr-card" role="group" :aria-label="`Attribute: ${name}`">
    <div class="attr-card-head">
      <p class="eyebrow">Attribute {{ index + 1 }}</p>
      <div class="attr-card-actions" role="group" aria-label="Attribute order">
        <button type="button" class="btn-icon" aria-label="Move up" title="Move attribute up" :disabled="index === 0" @click="emit('move', -1, $event.currentTarget)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
        </button>
        <button type="button" class="btn-icon" aria-label="Move down" title="Move attribute down" :disabled="index === count - 1" @click="emit('move', 1, $event.currentTarget)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
        </button>
      </div>
      <Btn variant="danger" size="sm" :aria-label="`Delete attribute ${name}`" @click="emit('remove')">Delete</Btn>
    </div>

    <Input v-model="attribute.name" label="Attribute name" placeholder="e.g. Difficulty" :error="errors[`${path}.name`]" />

    <div class="attr-settings">
      <div class="field" role="group" aria-label="Selection mode">
        <label>Selection mode</label>
        <!-- Changing the mode switches other settings off: only an explicit choice may do it. -->
        <Seg
          manual
          :model-value="attribute.selectionMode"
          :options="modes"
          @update:model-value="setSelectionMode(attribute, $event as SelectionMode)"
        />
      </div>
      <div class="attr-switches">
        <Switch
          :model-value="attribute.ordered"
          size="sm"
          label="Ordered"
          :disabled="multiple"
          @update:model-value="attribute.ordered = $event"
        />
        <Switch :model-value="attribute.required" size="sm" label="Required" @update:model-value="attribute.required = $event" />
      </div>
    </div>
    <p class="helper">
      {{
        multiple
          ? 'A question can have several options. Only single selection can be ordered.'
          : 'A question has one option. Ordered lets you sort questions by the order of the options.'
      }}
    </p>

    <div ref="optionList" class="option-list">
      <p class="option-list-title">Options</p>
      <OptionRow
        v-for="(option, i) in attribute.options"
        :key="option.id ?? option.ref"
        :option="option"
        :index="i"
        :count="attribute.options.length"
        :error="errors[`${path}.options.${i}.label`]"
        @move="(by, button) => moveOption(i, by, button)"
        @default="setDefault(attribute, i, $event)"
        @remove="removeOption(i)"
      />
      <p v-if="optionsError" class="options-err" role="alert">{{ optionsError }}</p>
      <Btn variant="ghost" size="sm" @click="appendOption">+ Add option</Btn>
    </div>
  </section>
</template>
