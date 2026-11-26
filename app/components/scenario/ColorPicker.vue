<script setup lang="ts">
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger, ToggleGroupItem, ToggleGroupRoot } from 'reka-ui'
import { COLOR_KEYS, colorVar, type ColorKey } from '#shared/scenario/colors'
import { colorName } from '~/utils/scenario-form'

const props = defineProps<{ modelValue: ColorKey }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: ColorKey): void }>()

const open = ref(false)

/** Picking the color already chosen empties the group: that keeps it and closes all the same. */
function choose(key: unknown) {
  if (key) emit('update:modelValue', key as ColorKey)
  open.value = false
}

function focusChosen(event: Event) {
  event.preventDefault()
  const list = event.target as HTMLElement
  list.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus()
}
</script>

<template>
  <div class="color-picker">
    <PopoverRoot v-model:open="open">
      <PopoverTrigger class="color-trigger" aria-label="Color" :title="colorName(props.modelValue)">
        <span class="swatch" :style="{ background: colorVar(props.modelValue) }" />
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          class="color-menu"
          align="start"
          :side-offset="4"
          :collision-padding="8"
          @open-auto-focus="focusChosen"
        >
          <!-- Arrows only move; a click, Enter or Space chooses. -->
          <ToggleGroupRoot class="color-grid" aria-label="Colors" type="single" :model-value="props.modelValue" @update:model-value="choose">
            <ToggleGroupItem
              v-for="key in COLOR_KEYS"
              :key="key"
              :value="key"
              class="color-choice"
              :aria-label="colorName(key)"
              :title="colorName(key)"
            >
              <span class="swatch" :style="{ background: colorVar(key) }" />
            </ToggleGroupItem>
          </ToggleGroupRoot>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  </div>
</template>
