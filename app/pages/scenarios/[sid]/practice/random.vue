<script setup lang="ts">
const route = useRoute()
const sid = String(route.params.sid)
</script>

<template>
  <div class="practice-wrap">
    <ClientOnly>
      <PracticeSession mode="random" :sid="sid" />
    </ClientOnly>
  </div>
</template>
