<script setup lang="ts">
import type { AttemptRow, QuestionWithStats } from '#shared/types/qadb'
import { fmtDT, rel } from '~/utils/format'

const props = defineProps<{ question: QuestionWithStats & { attempts: AttemptRow[] } }>()

const stats = computed(() => props.question.stats)
const last = computed(() => props.question.attempts[0] ?? null)
const last8 = computed(() => props.question.attempts.slice(0, 8))
</script>

<template>
  <details class="practice-track">
    <summary>Track record — {{ stats.attemptCount }} practiced</summary>
    <div class="track-mini">
      <span v-if="stats.attemptCount > 0">{{ stats.attemptCount }} practiced</span>
      <span v-if="stats.trackRecordPct != null">{{ stats.trackRecordPct.toFixed(1) }}% correct</span>
      <span v-if="last">last {{ last.correct ? '✔' : '✘' }} {{ rel(last.answered_at) }}</span>
      <span v-else>Not practiced yet</span>
    </div>
    <table v-if="last8.length" class="tr-table">
      <thead>
        <tr><th>Date · time</th><th class="res">Result</th></tr>
      </thead>
      <tbody>
        <tr v-for="a in last8" :key="a.id">
          <td>{{ fmtDT(a.answered_at) }}</td>
          <td class="res"><span :class="a.correct ? 'ok' : 'no'">{{ a.correct ? '✔' : '✘' }}</span></td>
        </tr>
      </tbody>
    </table>
  </details>
</template>
