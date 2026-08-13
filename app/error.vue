<script setup lang="ts">
const props = defineProps<{ error: { statusCode?: number } }>()

function handleError() {
  clearError({ redirect: '/content' })
}
</script>

<template>
  <div class="notfound">
    <p class="code">404 · PAGE NOT FOUND</p>
    <h1>This page doesn't exist.</h1>
    <p>The link may be broken, or the page moved.</p>
    <Btn @click="handleError">Back to content</Btn>
  </div>
</template>
