<script setup lang="ts">
import { contentPath } from '~/utils/scenario-route'

const { scenarios, error, refresh } = useScenarios()

// The header holds the list too, so arriving here does not read it again by itself.
const nuxtApp = useNuxtApp()
onMounted(() => {
  if (!nuxtApp.isHydrating) refresh()
})

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`
</script>

<template>
  <div class="content-wrap scenario-wrap">
    <div class="content-head">
      <div>
        <h1>Scenarios</h1>
        <p class="sub">Each scenario has its own questions and attributes.</p>
      </div>
    </div>

    <ul v-if="scenarios?.length" class="scenario-list">
      <li v-for="s in scenarios" :key="s.id">
        <NuxtLink class="mcard" :to="contentPath(s.id)">
          <div class="q">{{ s.name }}</div>
          <div class="stats">
            <span>{{ count(s.questionCount, 'question') }}</span>
            <span v-if="s.incompleteCount">{{ s.incompleteCount }} incomplete</span>
          </div>
        </NuxtLink>
      </li>
    </ul>

    <Empty v-else-if="error" title="Couldn't load your scenarios" text="Something went wrong fetching your scenarios. Check your connection and try again.">
      <template #icon>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 9v4M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
      </template>
      <Btn variant="secondary" size="sm" @click="refresh()">Try again</Btn>
    </Empty>

    <Empty v-else-if="scenarios" title="Create your first scenario" text="A scenario holds a set of questions and the attributes that describe them.">
      <template #icon>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12h14" /></svg>
      </template>
    </Empty>

    <ul v-else class="scenario-list" aria-hidden="true">
      <li v-for="i in 3" :key="i" class="mcard">
        <Skeleton width="40%" />
        <Skeleton width="90px" style="margin-top: 10px" />
      </li>
    </ul>
  </div>
</template>
