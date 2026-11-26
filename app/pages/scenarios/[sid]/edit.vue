<script setup lang="ts">
import type { ScenarioDetail } from '#shared/types/qadb'

// One page instance per scenario: each has its own form.
definePageMeta({ key: (route) => String(route.params.sid) })

const route = useRoute()
const sid = String(route.params.sid)
const api = useApi()

// Read afresh rather than shared: the form is filled once, and the counts must be current.
const scenario = shallowRef<ScenarioDetail | null>(null)
const notFound = ref(false)
const loadError = ref(false)

async function load() {
  loadError.value = false
  try {
    scenario.value = await api<ScenarioDetail>(`/api/scenarios/${encodeURIComponent(sid)}`)
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) notFound.value = true
    else loadError.value = true
  }
}

onMounted(load)
</script>

<template>
  <div v-if="notFound" class="notfound">
    <p class="code">404 · PAGE NOT FOUND</p>
    <h1>This page doesn't exist.</h1>
    <p>The link may be broken, or the page moved.</p>
    <Btn to="/scenarios">Back to scenarios</Btn>
  </div>

  <div v-else class="detail-wrap">
    <NuxtLink class="back-link" to="/scenarios">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6" /></svg>
      Back to scenarios
    </NuxtLink>

    <div class="content-head">
      <div>
        <h1>Edit scenario</h1>
        <p class="sub">Changes apply when you save. You are asked first if they affect existing questions.</p>
      </div>
    </div>

    <ScenarioForm v-if="scenario" :original="scenario" />

    <Empty v-else-if="loadError" title="Couldn't load this scenario" text="Something went wrong fetching it. Check your connection and try again.">
      <Btn variant="secondary" size="sm" @click="load">Try again</Btn>
    </Empty>

    <div v-else aria-hidden="true">
      <Skeleton height="38px" />
      <Skeleton height="220px" style="margin-top: 18px" />
    </div>
  </div>
</template>
