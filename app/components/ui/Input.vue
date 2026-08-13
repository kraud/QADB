<script setup lang="ts">
import { ref } from 'vue'
import { useId } from 'vue'

const props = withDefaults(
  defineProps<{
    label?: string
    type?: 'text' | 'password' | 'textarea' | 'select' | 'number' | 'url' | 'email'
    modelValue?: string
    placeholder?: string
    helper?: string
    error?: string
    required?: boolean
    options?: { value: string; label: string }[]
    name?: string
    autocomplete?: string
    min?: string | number
    toggleable?: boolean
  }>(),
  { type: 'text' },
)

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const id = useId()
const showPassword = ref(false)

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="field" :class="{ invalid: !!error }">
    <label v-if="label" :for="id">{{ label }}</label>

    <textarea
      v-if="type === 'textarea'"
      :id="id"
      class="textarea"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required"
      @input="onInput"
    />

    <select v-else-if="type === 'select'" :id="id" class="select" :value="modelValue" @change="onInput">
      <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
    </select>

    <div v-else-if="toggleable && type === 'password'" class="input-wrap">
      <input
        :id="id"
        class="input"
        :type="showPassword ? 'text' : 'password'"
        :value="modelValue"
        :placeholder="placeholder"
        :required="required"
        :name="name"
        :autocomplete="autocomplete"
        @input="onInput"
      />
      <button
        type="button"
        class="password-toggle"
        :aria-label="showPassword ? 'Hide password' : 'Show password'"
        @click="showPassword = !showPassword"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
      </button>
    </div>

    <input
      v-else
      :id="id"
      class="input"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required"
      :name="name"
      :autocomplete="autocomplete"
      :min="min"
      @input="onInput"
    />

    <p v-if="helper && !error" class="helper">{{ helper }}</p>
    <div v-if="error" class="field-err">{{ error }}</div>
  </div>
</template>
