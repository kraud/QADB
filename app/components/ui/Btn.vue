<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'error'
    size?: 'default' | 'sm' | 'lg' | 'icon'
    loading?: boolean
    disabled?: boolean
    type?: 'button' | 'submit'
    to?: string
    href?: string
  }>(),
  { variant: 'primary', size: 'default', type: 'button' },
)

const classes = computed(() => [
  `btn-${props.variant}`,
  { 'btn-sm': props.size === 'sm', 'btn-lg': props.size === 'lg', 'btn-icon': props.size === 'icon' },
])
</script>

<template>
  <NuxtLink v-if="to" :to="to" class="btn" :class="classes">
    <slot />
  </NuxtLink>
  <a v-else-if="href" :href="href" target="_blank" rel="noopener" class="btn" :class="classes">
    <slot />
  </a>
  <button v-else :type="type" :disabled="disabled || loading" class="btn" :class="classes">
    <span v-if="loading" class="spinner" aria-hidden="true" />
    <slot />
  </button>
</template>
