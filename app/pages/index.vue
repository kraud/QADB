<script setup lang="ts">
import type { ScenarioSummary } from '#shared/types/qadb'
import { homePath, LAST_SCENARIO_COOKIE } from '~/utils/scenario-route'

// Only redirects: no header, so nothing renders on the way through.
definePageMeta({ layout: false })

const { loggedIn } = useUserSession()
const api = useApi()
const lastOpened = useCookie<string | null>(LAST_SCENARIO_COOKIE)

async function target(): Promise<string | null> {
  if (!loggedIn.value) return '/login'
  try {
    return homePath(await api<ScenarioSummary[]>('/api/scenarios'), lastOpened.value ?? undefined)
  } catch (err) {
    // An expired session has already been sent to the login screen.
    if ((err as { statusCode?: number }).statusCode === 401) return null
    // The list reports the failure and offers a retry.
    return '/scenarios'
  }
}

const path = await target()
if (path) await navigateTo(path, { redirectCode: 302, replace: true })
</script>

<template>
  <div />
</template>
