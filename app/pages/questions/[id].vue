<script setup lang="ts">
// A question's address from before scenarios: sends on to the one it has now.
import type { QuestionWithStats } from '#shared/types/qadb'
import { questionPath } from '~/utils/scenario-route'

// Only redirects: no header, so nothing renders on the way through.
definePageMeta({ layout: false })

const route = useRoute()
const api = useApi()

async function target(): Promise<string | null> {
  try {
    const question = await api<QuestionWithStats>(`/api/questions/${encodeURIComponent(String(route.params.id))}`)
    return questionPath(question.scenarioId, question.id)
  } catch (err) {
    const { statusCode } = err as { statusCode?: number }
    // An expired session has already been sent to the login screen.
    if (statusCode === 401) return null
    // Missing, someone else's, or unreadable: the error page.
    throw createError({ statusCode: statusCode ?? 500, fatal: true })
  }
}

const path = await target()
if (path) await navigateTo(path, { redirectCode: 302, replace: true })
</script>

<template>
  <div />
</template>
